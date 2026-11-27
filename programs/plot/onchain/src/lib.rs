use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use anchor_spl::token_2022::{self, spl_token_2022, MintTo, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};
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
}
