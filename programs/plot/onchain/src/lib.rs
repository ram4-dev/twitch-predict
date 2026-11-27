use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZ7FEfcYkgMQHGc8XzX9W");

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
        c.admin = ctx.accounts.admin.key();
        c.payment_authority = payment_authority;
        c.resolver = resolver;
        c.treasury = treasury;
        c.treasury_bps = treasury_bps;
        c.streamer_bps = streamer_bps;
        c.bump = ctx.bumps.config;
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

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub version: u8,
    pub admin: Pubkey,
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
}
