use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use anchor_spl::token_2022::{self, spl_token_2022, Burn, MintTo, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_token_2022::extension::ExtensionType;

declare_id!("8mL78rx2dZufBaBiMnFQG2hCzENKd7euRWurZtp8gEpc");

#[program]
pub mod plot {
    use super::*;

    /// The upgrade authority controls the one-time bootstrap. This does not yet
    /// create a mint; config remains unusable for payments until that is added.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        payment_authority: Pubkey,
        resolver: Pubkey,
        treasury: Pubkey,
        treasury_bps: u16,
        streamer_bps: u16,
    ) -> Result<()> {
        require!(
            u32::from(treasury_bps) + u32::from(streamer_bps) <= 10_000,
            PlotError::InvalidFees
        );
        require!(
            payment_authority != Pubkey::default()
                && resolver != Pubkey::default()
                && treasury != Pubkey::default(),
            PlotError::InvalidAuthority
        );
        let c = &mut ctx.accounts.config;
        c.version = 1;
        c.mint = Pubkey::default();
        c.admin = ctx.accounts.admin.key();
        c.payment_authority = payment_authority;
        c.resolver = resolver;
        c.treasury = treasury;
        c.treasury_bps = treasury_bps;
        c.streamer_bps = streamer_bps;
        c.bump = ctx.bumps.config;
        Ok(())
    }
    /// The mint account is created and both initialization instructions execute atomically.
    pub fn initialize_mint(ctx: Context<InitializeMint>, decimals: u8) -> Result<()> {
        require!(
            ctx.accounts.config.mint == Pubkey::default(),
            PlotError::MintAlreadyInitialized
        );
        let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&[
            ExtensionType::NonTransferable,
        ])?;
        let rent = Rent::get()?.minimum_balance(space);
        invoke(
            &system_instruction::create_account(
                &ctx.accounts.admin.key(),
                &ctx.accounts.mint.key(),
                rent,
                space as u64,
                &ctx.accounts.token_program.key(),
            ),
            &[
                ctx.accounts.admin.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        let ix = spl_token_2022::instruction::initialize_non_transferable_mint(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
        )?;
        invoke(
            &ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;
        let ix = spl_token_2022::instruction::initialize_mint2(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.mint_authority.key(),
            None,
            decimals,
        )?;
        invoke(
            &ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;
        ctx.accounts.config.mint = ctx.accounts.mint.key();
        Ok(())
    }
    pub fn credit_points(
        ctx: Context<CreditPoints>,
        payment_hash: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, PlotError::InvalidAmount);
        let receipt = &mut ctx.accounts.receipt;
        if receipt.initialized {
            require!(
                receipt.owner == ctx.accounts.owner.key()
                    && receipt.amount == amount
                    && receipt.mint == ctx.accounts.mint.key(),
                PlotError::ReceiptMismatch
            );
            return Ok(());
        }
        let bump = ctx.bumps.mint_authority;
        let seeds: &[&[u8]] = &[b"mint_authority", &[bump]];
        token_2022::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        receipt.initialized = true;
        receipt.owner = ctx.accounts.owner.key();
        receipt.mint = ctx.accounts.mint.key();
        receipt.amount = amount;
        receipt.payment_hash = payment_hash;
        Ok(())
    }
    pub fn create_market(
        ctx: Context<CreateMarket>,
        identity: [u8; 32],
        option_ids: Vec<[u8; 32]>,
        close: i64,
        timeout: i64,
        streamer: Pubkey,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            (2..=6).contains(&option_ids.len())
                && close > now
                && timeout > close
                && streamer != Pubkey::default(),
            PlotError::InvalidMarket
        );
        for (i, item) in option_ids.iter().enumerate() {
            require!(
                item != &[0; 32] && !option_ids[..i].contains(item),
                PlotError::InvalidMarket
            );
        }
        let m = &mut ctx.accounts.market;
        m.config = ctx.accounts.config.key();
        m.identity = identity;
        m.creator = ctx.accounts.operator.key();
        m.option_count = option_ids.len() as u8;
        for (i, item) in option_ids.iter().enumerate() {
            m.option_ids[i] = *item;
        }
        m.close = close;
        m.timeout = timeout;
        m.treasury = ctx.accounts.config.treasury;
        m.streamer = streamer;
        m.treasury_bps = ctx.accounts.config.treasury_bps;
        m.streamer_bps = ctx.accounts.config.streamer_bps;
        m.bump = ctx.bumps.market;
        Ok(())
    }

    pub fn place_prediction(
        ctx: Context<PlacePrediction>,
        option: u8,
        amount: u64,
        sequence: u64,
    ) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(
            m.state == 0 && Clock::get()?.unix_timestamp < m.close,
            PlotError::InvalidState
        );
        require!(
            option < m.option_count && amount > 0,
            PlotError::InvalidAmount
        );
        let p = &mut ctx.accounts.position;
        if p.initialized {
            require!(
                p.option == option && p.sequence == sequence,
                PlotError::InvalidSequence
            );
        } else {
            require!(sequence == 0, PlotError::InvalidSequence);
            p.initialized = true;
            p.market = m.key();
            p.owner = ctx.accounts.owner.key();
            p.option = option;
            p.bump = ctx.bumps.position;
        }
        p.stake = p.stake.checked_add(amount).ok_or(PlotError::Overflow)?;
        p.sequence = p.sequence.checked_add(1).ok_or(PlotError::Overflow)?;
        m.totals[option as usize] = m.totals[option as usize]
            .checked_add(amount)
            .ok_or(PlotError::Overflow)?;
        m.gross = m.gross.checked_add(amount).ok_or(PlotError::Overflow)?;
        token_2022::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.source.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    pub fn lock_market(ctx: Context<ChangeMarket>) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(m.state == 0, PlotError::InvalidState);
        require!(
            ctx.accounts.actor.key() == ctx.accounts.config.resolver
                || Clock::get()?.unix_timestamp >= m.close,
            PlotError::InvalidAuthority
        );
        m.state = 1;
        Ok(())
    }

    pub fn cancel_market(ctx: Context<ChangeMarket>) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(m.state == 0 || m.state == 1, PlotError::InvalidState);
        require!(
            ctx.accounts.actor.key() == ctx.accounts.config.resolver
                || Clock::get()?.unix_timestamp >= m.timeout,
            PlotError::InvalidAuthority
        );
        m.state = 3;
        Ok(())
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, winner: u8) -> Result<()> {
        let m = &mut ctx.accounts.market;
        let now = Clock::get()?.unix_timestamp;
        require!(
            m.state == 1 && now >= m.close && now < m.timeout,
            PlotError::InvalidState
        );
        require!(winner < m.option_count, PlotError::InvalidMarket);
        if m.totals[winner as usize] == 0 {
            m.state = 3;
            return Ok(());
        }
        let treasury_fee = ((m.gross as u128) * (m.treasury_bps as u128) / 10_000) as u64;
        let streamer_fee = ((m.gross as u128) * (m.streamer_bps as u128) / 10_000) as u64;
        m.net = m
            .gross
            .checked_sub(treasury_fee)
            .and_then(|v| v.checked_sub(streamer_fee))
            .ok_or(PlotError::Overflow)?;
        let bump = ctx.bumps.mint_authority;
        let seeds: &[&[u8]] = &[b"mint_authority", &[bump]];
        for (destination, amount) in [
            (ctx.accounts.treasury_ata.to_account_info(), treasury_fee),
            (ctx.accounts.streamer_ata.to_account_info(), streamer_fee),
        ] {
            if amount > 0 {
                token_2022::mint_to(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        MintTo {
                            mint: ctx.accounts.mint.to_account_info(),
                            to: destination,
                            authority: ctx.accounts.mint_authority.to_account_info(),
                        },
                        &[seeds],
                    ),
                    amount,
                )?;
            }
        }
        m.winner = winner;
        m.state = 2;
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let m = &ctx.accounts.market;
        let p = &mut ctx.accounts.position;
        require!(!p.claimed, PlotError::AlreadyClaimed);
        let amount = match m.state {
            3 => p.stake,
            2 if p.option == m.winner => {
                ((p.stake as u128) * (m.net as u128) / (m.totals[m.winner as usize] as u128)) as u64
            }
            2 => 0,
            _ => return err!(PlotError::InvalidState),
        };
        p.claimed = true;
        if amount > 0 {
            let bump = ctx.bumps.mint_authority;
            let seeds: &[&[u8]] = &[b"mint_authority", &[bump]];
            token_2022::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.destination.to_account_info(),
                        authority: ctx.accounts.mint_authority.to_account_info(),
                    },
                    &[seeds],
                ),
                amount,
            )?;
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ PlotError::InvalidAuthority)]
    pub program: Program<'info, crate::program::Plot>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ PlotError::InvalidAuthority)]
    pub program_data: Account<'info, ProgramData>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeMint<'info> {
    #[account(mut, address = config.admin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub mint: Signer<'info>,
    /// CHECK: PDA is solely used as the token mint authority.
    #[account(seeds = [b"mint_authority"], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_hash: [u8; 32])]
pub struct CreditPoints<'info> {
    #[account(mut, address = config.payment_authority)]
    pub payment_authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, address = config.mint, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: owner is used only for associated account derivation and receipt identity.
    pub owner: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = owner, associated_token::token_program = token_program)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: verified mint authority PDA.
    #[account(seeds = [b"mint_authority"], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payment_authority, space = 8 + PaymentReceipt::INIT_SPACE, seeds = [b"payment", config.key().as_ref(), payment_hash.as_ref()], bump)]
    pub receipt: Account<'info, PaymentReceipt>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(identity: [u8; 32])]
pub struct CreateMarket<'info> {
    #[account(mut, address = config.resolver)]
    pub operator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = operator, space = 8 + Market::INIT_SPACE, seeds = [b"market", config.key().as_ref(), identity.as_ref()], bump)]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlacePrediction<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = config, seeds = [b"market", config.key().as_ref(), market.identity.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(init_if_needed, payer = payer, space = 8 + Position::INIT_SPACE, seeds = [b"position", market.key().as_ref(), owner.key().as_ref()], bump)]
    pub position: Account<'info, Position>,
    #[account(mut, address = config.mint, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = owner, associated_token::token_program = token_program)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ChangeMarket<'info> {
    pub actor: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = config, seeds = [b"market", config.key().as_ref(), market.identity.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(address = config.resolver)]
    pub resolver: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = config, seeds = [b"market", config.key().as_ref(), market.identity.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(mut, address = config.mint, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: fixed owner snapshotted in market.
    #[account(address = market.treasury)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: fixed owner snapshotted in market.
    #[account(address = market.streamer)]
    pub streamer: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = treasury, associated_token::token_program = token_program)]
    pub treasury_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = streamer, associated_token::token_program = token_program)]
    pub streamer_ata: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA for token mint authority.
    #[account(seeds = [b"mint_authority"], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(has_one = config, seeds = [b"market", config.key().as_ref(), market.identity.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market, has_one = owner, seeds = [b"position", market.key().as_ref(), owner.key().as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,
    #[account(mut, address = config.mint, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = owner, associated_token::token_program = token_program)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA for token mint authority.
    #[account(seeds = [b"mint_authority"], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub config: Pubkey,
    pub identity: [u8; 32],
    pub creator: Pubkey,
    pub option_ids: [[u8; 32]; 6],
    pub option_count: u8,
    pub close: i64,
    pub timeout: i64,
    pub totals: [u64; 6],
    pub gross: u64,
    pub net: u64,
    pub treasury: Pubkey,
    pub streamer: Pubkey,
    pub treasury_bps: u16,
    pub streamer_bps: u16,
    pub state: u8,
    pub winner: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub initialized: bool,
    pub market: Pubkey,
    pub owner: Pubkey,
    pub option: u8,
    pub stake: u64,
    pub sequence: u64,
    pub claimed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PaymentReceipt {
    pub initialized: bool,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub payment_hash: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub version: u8,
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub payment_authority: Pubkey,
    pub resolver: Pubkey,
    pub treasury: Pubkey,
    pub treasury_bps: u16,
    pub streamer_bps: u16,
    pub bump: u8,
}

#[error_code]
pub enum PlotError {
    #[msg("Fee total exceeds 10000 basis points")]
    InvalidFees,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Mint is already initialized")]
    MintAlreadyInitialized,
    #[msg("Amount must be positive")]
    InvalidAmount,
    #[msg("Payment receipt differs from retry")]
    ReceiptMismatch,
    #[msg("Invalid market")]
    InvalidMarket,
    #[msg("Invalid market state or time")]
    InvalidState,
    #[msg("Invalid contribution sequence or option")]
    InvalidSequence,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Position already claimed")]
    AlreadyClaimed,
}
