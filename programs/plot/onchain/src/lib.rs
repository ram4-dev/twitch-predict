use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use anchor_spl::token_2022::{spl_token_2022, Token2022};
use spl_token_2022::extension::ExtensionType;

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
}
