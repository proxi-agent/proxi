import { Injectable, Logger } from '@nestjs/common'

import type { ActorContext } from '../common/actor.js'
import { DatabaseService } from '../database/database.service.js'
import { DividendsService } from '../dividends/dividends.service.js'
import { IssuersService } from '../issuers/issuers.service.js'
import { LedgerService } from '../ledger/ledger.service.js'
import { NoticesService } from '../notices/notices.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { SecuritiesService } from '../securities/securities.service.js'
import { ShareholdersService } from '../shareholders/shareholders.service.js'
import { TasksService } from '../tasks/tasks.service.js'
import { TransferWorkflowService } from '../transfer-workflow/transfer-workflow.service.js'
import { VotingService } from '../voting/voting.service.js'

const SYSTEM_ACTOR: ActorContext = {
  actorId: 'system.seed',
  actorRole: 'super_admin',
}

interface SeedSummary {
  issuers: number
  users: number
  securities: number
  shareholders: number
  accounts: number
  ledgerEvents: number
  dividends: number
  meetings: number
  tasks: number
  notices: number
  ballots: number
  transferCases: number
}

interface ShareholderSeed {
  legalName: string
  classification: 'FUND' | 'INSTITUTION' | 'RETAIL' | 'TREASURY'
  jurisdiction: string
  riskTier: 'HIGH' | 'LOW' | 'MEDIUM'
  accountNumber: string
  email: string
  initialShares: number
}

const DEMO_HOLDERS: ShareholderSeed[] = [
  {
    accountNumber: 'ACC-ALPHA-001',
    classification: 'INSTITUTION',
    email: 'ops@alpha-capital.example',
    initialShares: 620_000,
    jurisdiction: 'US',
    legalName: 'Alpha Capital Partners LP',
    riskTier: 'LOW',
  },
  {
    accountNumber: 'ACC-AURORA-002',
    classification: 'FUND',
    email: 'treasury@aurora-fund.example',
    initialShares: 485_000,
    jurisdiction: 'GB',
    legalName: 'Aurora Growth Fund Ltd',
    riskTier: 'MEDIUM',
  },
  {
    accountNumber: 'ACC-BANYAN-003',
    classification: 'TREASURY',
    email: 'custody@banyan-trust.example',
    initialShares: 710_000,
    jurisdiction: 'US',
    legalName: 'Banyan Trust Services',
    riskTier: 'LOW',
  },
  {
    accountNumber: 'ACC-DELTA-004',
    classification: 'RETAIL',
    email: 'desk@delta-ventures.example',
    initialShares: 92_000,
    jurisdiction: 'SG',
    legalName: 'Delta Ventures Pte',
    riskTier: 'HIGH',
  },
  {
    accountNumber: 'ACC-EVEREST-005',
    classification: 'INSTITUTION',
    email: 'ops@everest-partners.example',
    initialShares: 358_000,
    jurisdiction: 'CA',
    legalName: 'Everest Partners Inc',
    riskTier: 'MEDIUM',
  },
]

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name)

  constructor(
    private readonly database: DatabaseService,
    private readonly issuersService: IssuersService,
    private readonly securitiesService: SecuritiesService,
    private readonly shareholdersService: ShareholdersService,
    private readonly ledgerService: LedgerService,
    private readonly dividendsService: DividendsService,
    private readonly votingService: VotingService,
    private readonly noticesService: NoticesService,
    private readonly tasksService: TasksService,
    private readonly transferWorkflow: TransferWorkflowService,
    private readonly prisma: PrismaService,
  ) {}

  async isSeeded(): Promise<boolean> {
    const result = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM issuers WHERE metadata->>'seed' = 'proxi-demo'`,
    )
    return Number(result.rows[0]?.count || '0') > 0
  }

  async ensureSeeded(): Promise<SeedSummary | null> {
    if (await this.isSeeded()) {
      return null
    }
    return this.seed()
  }

  async seed(): Promise<SeedSummary> {
    this.logger.log('Seeding demo data ...')
    const issuer = await this.issuersService.create(
      {
        cik: '0001099999',
        contactEmail: 'ir@proxi-demo.example',
        jurisdiction: 'US',
        legalName: 'Proxi Demo Holdings, Inc.',
        metadata: { seed: 'proxi-demo' },
        name: 'Proxi Demo',
        status: 'ACTIVE',
        website: 'https://proxi.example',
      },
      SYSTEM_ACTOR,
    )

    const security = await this.securitiesService.create(
      {
        authorizedShares: 10_000_000,
        currency: 'USD',
        cusip: '74349S102',
        issuerId: issuer.id,
        metadata: { seed: 'proxi-demo' },
        name: 'Proxi Demo Class A Common Stock',
        shareClasses: [
          {
            code: 'A',
            dividendEligible: true,
            name: 'Class A Common',
            parValueCents: 1,
            transferRestricted: false,
            votesPerShare: 1,
          },
          {
            code: 'B',
            dividendEligible: false,
            name: 'Class B Restricted',
            parValueCents: 1,
            transferRestricted: true,
            votesPerShare: 10,
          },
        ],
        status: 'ACTIVE',
        ticker: 'PROXI',
      },
      SYSTEM_ACTOR,
    )

    const shareholders: Array<{ accountNumber: string; accountId: string; shareholderId: string; initialShares: number }> = []

    for (const seed of DEMO_HOLDERS) {
      const shareholder = await this.shareholdersService.create(
        {
          classification: seed.classification,
          email: seed.email,
          issuerId: issuer.id,
          jurisdiction: seed.jurisdiction,
          kycStatus: 'APPROVED',
          legalName: seed.legalName,
          metadata: { seed: 'proxi-demo' },
          riskTier: seed.riskTier,
          status: 'ACTIVE',
        },
        SYSTEM_ACTOR,
      )
      const account = await this.shareholdersService.addAccount(
        {
          accountNumber: seed.accountNumber,
          address: { country: seed.jurisdiction },
          metadata: { seed: 'proxi-demo' },
          primaryEmail: seed.email,
          registrationType: seed.classification === 'RETAIL' ? 'INDIVIDUAL' : 'ENTITY',
          shareholderId: shareholder.id,
        },
        SYSTEM_ACTOR,
      )
      shareholders.push({
        accountId: account.id,
        accountNumber: account.accountNumber,
        initialShares: seed.initialShares,
        shareholderId: shareholder.id,
      })
    }

    const usersCreated = await this.seedDemoUsers(issuer.id, shareholders)

    let ledgerEvents = 0
    for (const holder of shareholders) {
      await this.ledgerService.issue(
        {
          holderId: holder.accountNumber,
          metadata: { seed: 'proxi-demo' },
          quantity: holder.initialShares,
          reason: 'Seed issuance',
          securityId: security.id,
        },
        SYSTEM_ACTOR,
      )
      ledgerEvents += 1
    }

    await this.ledgerService.transfer(
      {
        fromHolderId: shareholders[0].accountNumber,
        quantity: 50_000,
        reason: 'Secondary market trade',
        securityId: security.id,
        toHolderId: shareholders[3].accountNumber,
      },
      SYSTEM_ACTOR,
    )
    ledgerEvents += 1
    await this.ledgerService.transfer(
      {
        fromHolderId: shareholders[2].accountNumber,
        quantity: 25_000,
        reason: 'Estate re-registration',
        securityId: security.id,
        toHolderId: shareholders[4].accountNumber,
      },
      SYSTEM_ACTOR,
    )
    ledgerEvents += 1

    const recordDate = dateDaysAgo(3)
    const dividend = await this.dividendsService.create(
      {
        currency: 'USD',
        declarationDate: dateDaysAgo(7),
        description: 'Quarterly cash dividend (seed)',
        issuerId: issuer.id,
        kind: 'CASH',
        metadata: { seed: 'proxi-demo' },
        paymentDate: dateDaysFromNow(7),
        ratePerShareCents: 25,
        recordDate,
        securityId: security.id,
        shareClassId: security.shareClasses.find(cls => cls.code === 'A')?.id,
      },
      SYSTEM_ACTOR,
    )
    await this.dividendsService.declare(dividend.id, SYSTEM_ACTOR)
    const snapshot = await this.dividendsService.snapshot(dividend.id, SYSTEM_ACTOR)
    for (const entitlement of snapshot.entitlements.slice(0, 2)) {
      await this.dividendsService.markEntitlementPaid(
        {
          entitlementId: entitlement.id,
          metadata: { channel: 'ACH', seed: 'proxi-demo' },
          paymentReference: `ACH-${entitlement.id.slice(-6).toUpperCase()}`,
        },
        SYSTEM_ACTOR,
      )
    }

    const meeting = await this.votingService.createMeeting(
      {
        description: 'Annual meeting of stockholders (seed)',
        issuerId: issuer.id,
        kind: 'ANNUAL',
        metadata: { seed: 'proxi-demo' },
        quorumPct: 40,
        recordDate,
        scheduledAt: dateDaysFromNow(14) + 'T17:00:00.000Z',
        title: 'Proxi Demo 2026 Annual Meeting',
        virtualUrl: 'https://meet.proxi.example/demo-2026',
      },
      SYSTEM_ACTOR,
    )

    await this.votingService.upsertProposals(
      meeting.id,
      {
        proposals: [
          {
            boardRecommendation: 'FOR',
            code: 'P1',
            description: 'To elect the slate of directors nominated by the Board.',
            kind: 'ORDINARY',
            requiredPct: 50,
            sortOrder: 1,
            title: 'Election of Directors',
          },
          {
            boardRecommendation: 'FOR',
            code: 'P2',
            description: 'Ratification of the independent auditor for the upcoming fiscal year.',
            kind: 'ORDINARY',
            requiredPct: 50,
            sortOrder: 2,
            title: 'Ratification of Independent Auditor',
          },
          {
            boardRecommendation: 'AGAINST',
            code: 'P3',
            description: 'Shareholder proposal regarding enhanced ESG disclosures.',
            kind: 'SHAREHOLDER',
            requiredPct: 50,
            sortOrder: 3,
            title: 'Shareholder Proposal — ESG Reporting',
          },
        ],
      },
      SYSTEM_ACTOR,
    )

    await this.votingService.openMeeting(meeting.id, security.id, SYSTEM_ACTOR)

    const ballotsPage = await this.votingService.listBallots({
      meetingId: meeting.id,
      page: 1,
      pageSize: 200,
      sortDir: 'asc',
    })
    const meetingDetail = await this.votingService.getMeeting(meeting.id)
    let ballotsSubmitted = 0
    for (const [index, ballot] of ballotsPage.items.entries()) {
      const choice = index % 3 === 0 ? 'AGAINST' : 'FOR'
      const votes = meetingDetail.proposals.map((proposal, idx) => ({
        choice: idx === 2 && index % 2 === 0 ? 'AGAINST' : choice,
        proposalId: proposal.id,
      })) as Array<{ choice: 'ABSTAIN' | 'AGAINST' | 'FOR'; proposalId: string }>
      await this.votingService.submitBallot(ballot.id, { controlNumber: ballot.controlNumber, votes }, SYSTEM_ACTOR)
      ballotsSubmitted += 1
    }

    await this.votingService.closeMeeting(meeting.id, SYSTEM_ACTOR)
    await this.votingService.certifyMeeting(meeting.id, SYSTEM_ACTOR)

    await this.noticesService.create(
      {
        audience: 'HOLDERS',
        body: 'The Board has declared a quarterly cash dividend of $0.25 per Class A share. See record and payment dates.',
        issuerId: issuer.id,
        kind: 'DIVIDEND',
        metadata: { seed: 'proxi-demo' },
        relatedEntityId: dividend.id,
        relatedEntityType: 'DIVIDEND_EVENT',
        subject: 'Q2 Cash Dividend Declared',
      },
      SYSTEM_ACTOR,
    )
    const meetingNotice = await this.noticesService.create(
      {
        audience: 'HOLDERS',
        body: 'Notice of Annual Meeting and proxy materials are now available.',
        issuerId: issuer.id,
        kind: 'MEETING',
        metadata: { seed: 'proxi-demo' },
        relatedEntityId: meeting.id,
        relatedEntityType: 'MEETING',
        subject: 'Notice of 2026 Annual Meeting',
      },
      SYSTEM_ACTOR,
    )
    await this.noticesService.publish(meetingNotice.id, SYSTEM_ACTOR)

    await this.tasksService.create(
      {
        description: 'Review reconciliation break between custody records and ledger for Aurora Growth Fund.',
        dueAt: dateDaysFromNow(2) + 'T00:00:00.000Z',
        issuerId: issuer.id,
        priority: 'HIGH',
        recommendedActions: [
          { action: 'OPEN_RECONCILIATION', label: 'Open reconciliation tool' },
          { action: 'CONTACT_HOLDER', label: 'Email shareholder', metadata: { holderId: shareholders[1].shareholderId } },
        ],
        relatedEntityId: shareholders[1].shareholderId,
        relatedEntityType: 'SHAREHOLDER',
        severity: 'WARN',
        source: 'RECONCILIATION',
        title: 'Reconciliation break: Aurora Growth Fund',
        type: 'LEDGER_EXCEPTION',
      },
      SYSTEM_ACTOR,
    )
    await this.tasksService.create(
      {
        description: 'KYC refresh requested for Delta Ventures Pte; missing beneficial owner attestation.',
        dueAt: dateDaysFromNow(7) + 'T00:00:00.000Z',
        issuerId: issuer.id,
        priority: 'MEDIUM',
        relatedEntityId: shareholders[3].shareholderId,
        relatedEntityType: 'SHAREHOLDER',
        severity: 'INFO',
        source: 'SYSTEM',
        title: 'KYC follow-up: Delta Ventures',
        type: 'KYC_FOLLOWUP',
      },
      SYSTEM_ACTOR,
    )

    const transferCases = await this.seedTransferCases({
      issuerId: issuer.id,
      securityId: security.id,
      shareClassIdA: security.shareClasses.find(c => c.code === 'A')?.id ?? security.shareClasses[0].id,
      shareClassIdB: security.shareClasses.find(c => c.code === 'B')?.id ?? security.shareClasses[0].id,
      shareholders,
    })

    const summary: SeedSummary = {
      accounts: shareholders.length,
      ballots: ballotsSubmitted,
      dividends: 1,
      issuers: 1,
      ledgerEvents,
      meetings: 1,
      notices: 2,
      securities: 1,
      shareholders: shareholders.length,
      tasks: 2,
      transferCases,
      users: usersCreated,
    }
    this.logger.log(`Seed complete: ${JSON.stringify(summary)}`)
    return summary
  }

  /**
   * Demo data covering the full workflow branching set so reviewers can
   * see every state the admin UI might render on a fresh install.
   *
   * Each scenario is constructed by driving the real workflow service —
   * `create → intake → runAutomatedReview → (branch) → …` — so the
   * resulting rows exercise the same paths production uses.
   */
  private async seedTransferCases(args: {
    issuerId: string
    securityId: string
    shareClassIdA: string
    shareClassIdB: string
    shareholders: Array<{ accountId: string; accountNumber: string; initialShares: number; shareholderId: string }>
  }): Promise<number> {
    const [alpha, aurora, banyan, delta, epsilon] = args.shareholders
    const common = {
      issuerId: args.issuerId,
      securityId: args.securityId,
      shareClassId: args.shareClassIdA,
    }

    let created = 0

    // 1. Normal successful transfer — auto-passes, gets approved + settled.
    {
      const t = await this.transferWorkflow.create(
        {
          ...common,
          fromAccountId: alpha.accountId,
          intakeMethod: 'GUIDED_ENTRY',
          quantity: 1_500,
          submit: true,
          toAccountId: delta.accountId,
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runIntake(
        t.id,
        {
          caseType: 'standard_individual',
          destinationKind: 'individual',
          estimatedValueUsd: 45_000,
          extractedFields: {
            fieldConfidence: { registration: 0.95, transferorName: 0.96, transfereeName: 0.95 },
            registration: 'Alpha Capital Partners LP',
            sharesRequested: 1500,
            transfereeName: 'Delta Ventures Pte',
            transferorName: 'Alpha Capital Partners LP',
          },
          intakeSource: 'portal',
          submittedDocumentCodes: ['stock_power', 'gov_id_transferor', 'w9', 'medallion'],
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runAutomatedReview(
        t.id,
        {
          registeredAccountOwner: 'Alpha Capital Partners LP',
          registeredHolderName: 'Alpha Capital Partners LP',
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.approve(t.id, { notes: 'Dual-control approval (seed)' }, SYSTEM_ACTOR)
      await this.transferWorkflow.scheduleSettlement(t.id, SYSTEM_ACTOR)
      for (const step of [
        'validate_registration',
        'validate_tax_docs',
        'cancel_old_position',
        'issue_new_position',
        'generate_drs_statement',
        'confirm_prior_cancellation',
      ] as const) {
        await this.transferWorkflow.advanceSettlementStep(t.id, { status: 'completed', step }, SYSTEM_ACTOR)
      }
      await this.transferWorkflow.settle(t.id, { notes: 'Final settlement (seed)' }, SYSTEM_ACTOR)
      created += 1
    }

    // 2. Missing documents — awaiting_documents branch.
    {
      const t = await this.transferWorkflow.create(
        {
          ...common,
          fromAccountId: aurora.accountId,
          intakeMethod: 'DOCUMENT_UPLOAD',
          quantity: 2_500,
          submit: true,
          toAccountId: banyan.accountId,
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runIntake(
        t.id,
        {
          caseType: 'gift',
          destinationKind: 'individual',
          extractedFields: {
            fieldConfidence: { transferorName: 0.82 },
            transferorName: 'Aurora Growth Fund Ltd',
          },
          intakeSource: 'form_upload',
          submittedDocumentCodes: ['stock_power'],
        },
        SYSTEM_ACTOR,
      )
      created += 1
    }

    // 3. Low-confidence → manual review.
    {
      const t = await this.transferWorkflow.create(
        {
          ...common,
          fromAccountId: delta.accountId,
          intakeMethod: 'DOCUMENT_UPLOAD',
          quantity: 500,
          submit: true,
          toAccountId: alpha.accountId,
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runIntake(
        t.id,
        {
          caseType: 'standard_individual',
          destinationKind: 'individual',
          extractedFields: {
            fieldConfidence: { registration: 0.55, transferorName: 0.6, transfereeName: 0.6 },
            transferorName: 'Delta Ventures Pte',
          },
          intakeSource: 'form_upload',
          submittedDocumentCodes: ['stock_power', 'gov_id_transferor', 'w9'],
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runAutomatedReview(t.id, { registeredHolderName: 'Delta Ventures Pte' }, SYSTEM_ACTOR)
      created += 1
    }

    // 4. Stop transfer order branch.
    {
      const t = await this.transferWorkflow.create(
        {
          ...common,
          fromAccountId: banyan.accountId,
          quantity: 10_000,
          submit: true,
          toAccountId: alpha.accountId,
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runIntake(
        t.id,
        {
          caseType: 'standard_individual',
          destinationKind: 'individual',
          extractedFields: { transferorName: 'Banyan Trust Services' },
          submittedDocumentCodes: ['stock_power', 'gov_id_transferor', 'w9', 'medallion'],
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.raiseStopOrder(
        t.id,
        { reason: 'Court-ordered stop transfer pending dispute resolution.', referenceCode: 'STO-2026-0042' },
        SYSTEM_ACTOR,
      )
      created += 1
    }

    // 5. Adverse claim branch.
    if (epsilon) {
      const t = await this.transferWorkflow.create(
        {
          ...common,
          fromAccountId: epsilon.accountId,
          quantity: 3_200,
          submit: true,
          toAccountId: delta.accountId,
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runIntake(
        t.id,
        {
          caseType: 'fiduciary',
          destinationKind: 'individual',
          extractedFields: { transferorName: 'Epsilon Family Office' },
          submittedDocumentCodes: ['stock_power', 'fiduciary_appointment', 'gov_id_transferor', 'court_order'],
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.raiseAdverseClaim(
        t.id,
        { claimantName: 'Jane Doe (former beneficiary)', reason: 'Beneficiary contests authority to transfer fiduciary assets.' },
        SYSTEM_ACTOR,
      )
      created += 1
    }

    // 6. Deceased-owner estate path.
    {
      const t = await this.transferWorkflow.create(
        {
          ...common,
          fromAccountId: alpha.accountId,
          quantity: 800,
          submit: true,
          toAccountId: banyan.accountId,
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runIntake(
        t.id,
        {
          caseType: 'estate',
          destinationKind: 'trust',
          needsInheritanceWaiver: true,
          submittedDocumentCodes: ['stock_power', 'death_certificate', 'affidavit_of_domicile', 'fiduciary_appointment'],
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.raiseDeceasedFlag(
        t.id,
        {
          dateOfDeath: dateDaysAgo(40).slice(0, 10),
          reason: 'Estate transfer request; validate succession documents.',
          waiverRequired: true,
        },
        SYSTEM_ACTOR,
      )
      created += 1
    }

    // 7. Restricted shares → legal opinion path.
    {
      const t = await this.transferWorkflow.create(
        {
          ...common,
          fromAccountId: alpha.accountId,
          kind: 'CANCELLATION',
          quantity: 5_000,
          shareClassId: args.shareClassIdB,
          submit: true,
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runIntake(
        t.id,
        {
          caseType: 'restricted_shares',
          destinationKind: 'individual',
          estimatedValueUsd: 180_000,
          extractedFields: { transferorName: 'Alpha Capital Partners LP' },
          submittedDocumentCodes: ['stock_power', 'representation_letter', 'gov_id_transferor'],
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.raiseRestriction(
        t.id,
        { category: 'rule_144', reason: 'Rule 144 analysis required before legend removal.' },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.requestLegalOpinion(t.id, { provider: 'Issuer external counsel' }, SYSTEM_ACTOR)
      created += 1
    }

    // 8. Failed transfer — documents timeout.
    {
      const t = await this.transferWorkflow.create(
        {
          ...common,
          fromAccountId: aurora.accountId,
          quantity: 1_250,
          submit: true,
          toAccountId: delta.accountId,
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.runIntake(
        t.id,
        {
          caseType: 'gift',
          destinationKind: 'individual',
          submittedDocumentCodes: ['stock_power'],
        },
        SYSTEM_ACTOR,
      )
      await this.transferWorkflow.failCase(
        t.id,
        { code: 'documents_timeout', reason: 'Supplemental documents not received within 30-day window.' },
        SYSTEM_ACTOR,
      )
      created += 1
    }

    this.logger.log(`Seeded ${created} transfer case(s) covering full workflow branches`)
    return created
  }

  async reset(): Promise<void> {
    await this.database.tx(async client => {
      await client.query(`DELETE FROM votes`)
      await client.query(`DELETE FROM ballots`)
      await client.query(`DELETE FROM proposals`)
      await client.query(`DELETE FROM meetings`)
      await client.query(`DELETE FROM dividend_entitlements`)
      await client.query(`DELETE FROM dividend_payments`)
      await client.query(`DELETE FROM dividend_events`)
      await client.query(`DELETE FROM transfer_reviews`)
      await client.query(`DELETE FROM transfer_requests`)
      await client.query(`DELETE FROM holdings`)
      await client.query(`DELETE FROM ledger_entries`)
      await client.query(`DELETE FROM documents`)
      await client.query(`DELETE FROM notices`)
      await client.query(`DELETE FROM tasks`)
      await client.query(`DELETE FROM ledger_events`)
      await client.query(`DELETE FROM shareholder_accounts`)
      await client.query(`DELETE FROM shareholders`)
      await client.query(`DELETE FROM user_issuer_roles`)
      await client.query(`DELETE FROM users`)
      await client.query(`DELETE FROM share_classes`)
      await client.query(`DELETE FROM securities`)
      await client.query(`DELETE FROM issuers`)
      await client.query(`DELETE FROM audit_events`)
    })
    this.logger.warn('All seed data reset')
  }

  private async seedDemoUsers(
    issuerId: string,
    shareholders: Array<{ accountNumber: string; accountId: string; shareholderId: string; initialShares: number }>,
  ): Promise<number> {
    const demoUsers = [
      {
        email: 'super.admin@proxi-demo.example',
        externalId: 'demo-super-admin',
        fullName: 'Demo Super Admin',
        issuerRole: null as null | 'ISSUER_ADMIN' | 'ISSUER_OPERATOR' | 'INVESTOR',
        platformRole: 'ADMIN',
      },
      {
        email: 'agent.admin@proxi-demo.example',
        externalId: 'demo-transfer-agent-admin',
        fullName: 'Demo Transfer Agent Admin',
        issuerRole: null as null | 'ISSUER_ADMIN' | 'ISSUER_OPERATOR' | 'INVESTOR',
        platformRole: 'OPERATIONS',
      },
      {
        email: 'issuer.admin@proxi-demo.example',
        externalId: 'demo-issuer-admin',
        fullName: 'Demo Issuer Admin',
        issuerRole: 'ISSUER_ADMIN' as const,
        platformRole: 'NONE',
      },
      {
        email: 'issuer.operator@proxi-demo.example',
        externalId: 'demo-issuer-operator',
        fullName: 'Demo Issuer Operator',
        issuerRole: 'ISSUER_OPERATOR' as const,
        platformRole: 'NONE',
      },
      {
        email: 'shareholder@proxi-demo.example',
        externalId: 'demo-shareholder',
        fullName: 'Demo Shareholder',
        issuerRole: 'INVESTOR' as const,
        platformRole: 'NONE',
      },
    ]

    // Attach one seeded holder email to the shareholder demo user so account
    // scoping can be inferred from existing shareholder/account records.
    const shareholder = shareholders[3]
    if (shareholder) {
      await this.database.query(
        `UPDATE shareholder_accounts
         SET primary_email = $2, updated_at = NOW()
         WHERE id = $1`,
        [shareholder.accountId, 'shareholder@proxi-demo.example'],
      )
      await this.database.query(
        `UPDATE shareholders
         SET email = $2, updated_at = NOW()
         WHERE id = $1`,
        [shareholder.shareholderId, 'shareholder@proxi-demo.example'],
      )
    }

    let created = 0
    for (const user of demoUsers) {
      const id = `usr_${user.externalId.replace(/[^a-z0-9]/gi, '_')}`
      await this.database.query(
        `INSERT INTO users (id, external_id, email, full_name, status, platform_role)
         VALUES ($1,$2,$3,$4,'ACTIVE',$5)
         ON CONFLICT (external_id)
         DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, platform_role = EXCLUDED.platform_role, updated_at = NOW()`,
        [id, user.externalId, user.email, user.fullName, user.platformRole],
      )
      created += 1
      if (user.issuerRole) {
        await this.database.query(
          `INSERT INTO user_issuer_roles (id, user_id, issuer_id, role)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, issuer_id)
           DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
          [`uir_${id}_${issuerId}`, id, issuerId, user.issuerRole],
        )
      }
    }
    return created
  }
}

function dateDaysAgo(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function dateDaysFromNow(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
