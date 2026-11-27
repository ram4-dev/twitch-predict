//! Checked settlement arithmetic. This crate does not implement the on-chain program.

#[derive(Debug, PartialEq, Eq)]
pub enum SettlementError {
    InvalidFees,
    InvalidStake,
    Overflow,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Settlement {
    pub treasury: u64,
    pub streamer: u64,
    pub net: u64,
}

pub fn settle(
    gross: u64,
    treasury_bps: u16,
    streamer_bps: u16,
) -> Result<Settlement, SettlementError> {
    if u32::from(treasury_bps) + u32::from(streamer_bps) > 10_000 {
        return Err(SettlementError::InvalidFees);
    }
    let fee = |bps| -> Result<u64, SettlementError> {
        u64::try_from(u128::from(gross) * u128::from(bps) / 10_000)
            .map_err(|_| SettlementError::Overflow)
    };
    let treasury = fee(treasury_bps)?;
    let streamer = fee(streamer_bps)?;
    let net = gross
        .checked_sub(treasury)
        .and_then(|v| v.checked_sub(streamer))
        .ok_or(SettlementError::Overflow)?;
    Ok(Settlement {
        treasury,
        streamer,
        net,
    })
}

pub fn winning_claim(stake: u64, winning_total: u64, net: u64) -> Result<u64, SettlementError> {
    if winning_total == 0 || stake > winning_total {
        return Err(SettlementError::InvalidStake);
    }
    u64::try_from(u128::from(stake) * u128::from(net) / u128::from(winning_total))
        .map_err(|_| SettlementError::Overflow)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_vector_and_small_pools() {
        let s = settle(1000, 200, 200).unwrap();
        assert_eq!(
            s,
            Settlement {
                treasury: 20,
                streamer: 20,
                net: 960
            }
        );
        assert_eq!(winning_claim(600, 600, s.net), Ok(960));
        assert_eq!(settle(3, 200, 200).unwrap().net, 3);
        assert_eq!(winning_claim(1, 3, 3), Ok(1));
    }

    #[test]
    fn bounds_and_rounding_never_create_value() {
        assert_eq!(settle(1, 10_000, 1), Err(SettlementError::InvalidFees));
        assert_eq!(winning_claim(1, 0, 1), Err(SettlementError::InvalidStake));
        assert_eq!(winning_claim(2, 1, 1), Err(SettlementError::InvalidStake));
        for gross in [0, 1, 2, 99, 1000, u64::MAX] {
            let s = settle(gross, 200, 200).unwrap();
            assert_eq!(
                u128::from(s.treasury) + u128::from(s.streamer) + u128::from(s.net),
                u128::from(gross)
            );
            let a = winning_claim(1, 3, s.net).unwrap();
            let b = winning_claim(2, 3, s.net).unwrap();
            assert!(u128::from(a) + u128::from(b) <= u128::from(s.net));
        }
    }
}

/// Deterministic market rules; callers must enforce signatures, PDAs and token CPIs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Market {
    pub close: i64,
    pub timeout: i64,
    pub totals: Vec<u64>,
    pub gross: u64,
    pub treasury_bps: u16,
    pub streamer_bps: u16,
    pub state: MarketState,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MarketState {
    Open,
    Locked,
    Resolved { winner: usize, net: u64 },
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Position {
    pub option: usize,
    pub stake: u64,
    pub sequence: u64,
    pub claimed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MarketError {
    InvalidParameters,
    WrongState,
    Unauthorized,
    Time,
    InvalidOption,
    InvalidSequence,
    Overflow,
    AlreadyClaimed,
}

impl Market {
    pub fn new(
        options: usize,
        close: i64,
        timeout: i64,
        now: i64,
        treasury_bps: u16,
        streamer_bps: u16,
    ) -> Result<Self, MarketError> {
        if !(2..=6).contains(&options)
            || close <= now
            || timeout <= close
            || settle(0, treasury_bps, streamer_bps).is_err()
        {
            return Err(MarketError::InvalidParameters);
        }
        Ok(Self {
            close,
            timeout,
            totals: vec![0; options],
            gross: 0,
            treasury_bps,
            streamer_bps,
            state: MarketState::Open,
        })
    }

    pub fn place(
        &mut self,
        position: &mut Option<Position>,
        option: usize,
        amount: u64,
        sequence: u64,
        now: i64,
    ) -> Result<(), MarketError> {
        if self.state != MarketState::Open {
            return Err(MarketError::WrongState);
        }
        if now >= self.close {
            return Err(MarketError::Time);
        }
        if option >= self.totals.len() || amount == 0 {
            return Err(MarketError::InvalidOption);
        }
        let mut next = position.clone().unwrap_or(Position {
            option,
            stake: 0,
            sequence: 0,
            claimed: false,
        });
        if next.option != option {
            return Err(MarketError::InvalidOption);
        }
        if next.sequence != sequence {
            return Err(MarketError::InvalidSequence);
        }
        next.stake = next
            .stake
            .checked_add(amount)
            .ok_or(MarketError::Overflow)?;
        next.sequence = next.sequence.checked_add(1).ok_or(MarketError::Overflow)?;
        let total = self.totals[option]
            .checked_add(amount)
            .ok_or(MarketError::Overflow)?;
        let gross = self
            .gross
            .checked_add(amount)
            .ok_or(MarketError::Overflow)?;
        self.totals[option] = total;
        self.gross = gross;
        *position = Some(next);
        Ok(())
    }

    pub fn lock(&mut self, now: i64, resolver: bool) -> Result<(), MarketError> {
        if self.state != MarketState::Open {
            return Err(MarketError::WrongState);
        }
        if now < self.close && !resolver {
            return Err(MarketError::Unauthorized);
        }
        self.state = MarketState::Locked;
        Ok(())
    }

    pub fn resolve(
        &mut self,
        winner: usize,
        now: i64,
        resolver: bool,
    ) -> Result<Option<Settlement>, MarketError> {
        if !resolver {
            return Err(MarketError::Unauthorized);
        }
        if self.state != MarketState::Locked {
            return Err(MarketError::WrongState);
        }
        if now < self.close || now >= self.timeout {
            return Err(MarketError::Time);
        }
        if winner >= self.totals.len() {
            return Err(MarketError::InvalidOption);
        }
        if self.totals[winner] == 0 {
            self.state = MarketState::Cancelled;
            return Ok(None);
        }
        let fees = settle(self.gross, self.treasury_bps, self.streamer_bps)
            .map_err(|_| MarketError::Overflow)?;
        self.state = MarketState::Resolved {
            winner,
            net: fees.net,
        };
        Ok(Some(fees))
    }

    pub fn cancel(&mut self, now: i64, resolver: bool) -> Result<(), MarketError> {
        if !matches!(self.state, MarketState::Open | MarketState::Locked) {
            return Err(MarketError::WrongState);
        }
        if now < self.timeout && !resolver {
            return Err(MarketError::Unauthorized);
        }
        self.state = MarketState::Cancelled;
        Ok(())
    }

    pub fn claim(&self, position: &mut Position) -> Result<u64, MarketError> {
        if position.claimed {
            return Err(MarketError::AlreadyClaimed);
        }
        let amount = match self.state {
            MarketState::Cancelled => position.stake,
            MarketState::Resolved { winner, net } if winner == position.option => {
                winning_claim(position.stake, self.totals[winner], net)
                    .map_err(|_| MarketError::Overflow)?
            }
            MarketState::Resolved { .. } => 0,
            _ => return Err(MarketError::WrongState),
        };
        position.claimed = true;
        Ok(amount)
    }
}

#[cfg(test)]
mod market_tests {
    use super::*;
    #[test]
    fn lifecycle_and_replay() {
        let mut m = Market::new(2, 10, 20, 0, 200, 200).unwrap();
        let (mut a, mut b) = (None, None);
        m.place(&mut a, 0, 600, 0, 1).unwrap();
        assert_eq!(
            m.place(&mut a, 0, 600, 0, 1),
            Err(MarketError::InvalidSequence)
        );
        m.place(&mut b, 1, 400, 0, 1).unwrap();
        assert_eq!(m.lock(9, false), Err(MarketError::Unauthorized));
        m.lock(9, true).unwrap();
        assert_eq!(m.resolve(0, 9, true), Err(MarketError::Time));
        assert_eq!(
            m.resolve(0, 10, true).unwrap().unwrap(),
            Settlement {
                treasury: 20,
                streamer: 20,
                net: 960
            }
        );
        let mut a = a.unwrap();
        assert_eq!(m.claim(&mut a), Ok(960));
        assert_eq!(m.claim(&mut a), Err(MarketError::AlreadyClaimed));
        assert_eq!(m.claim(&mut b.unwrap()), Ok(0));
    }
    #[test]
    fn timeout_and_zero_winner_refund() {
        let mut m = Market::new(6, 10, 20, 0, 200, 200).unwrap();
        let mut p = None;
        m.place(&mut p, 0, 600, 0, 0).unwrap();
        assert_eq!(m.cancel(19, false), Err(MarketError::Unauthorized));
        m.cancel(20, false).unwrap();
        assert_eq!(m.claim(&mut p.unwrap()), Ok(600));
        let mut m = Market::new(2, 10, 20, 0, 200, 200).unwrap();
        m.lock(10, false).unwrap();
        assert_eq!(m.resolve(1, 10, true), Ok(None));
        assert_eq!(m.state, MarketState::Cancelled);
    }
}
