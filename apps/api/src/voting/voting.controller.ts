import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { IsString } from 'class-validator'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import {
  BallotListQuery,
  BulkProposalsDto,
  CreateMeetingDto,
  MeetingListQuery,
  SubmitBallotDto,
  UpdateMeetingDto,
} from './voting.dto.js'
import { VotingService } from './voting.service.js'

class OpenMeetingDto {
  @IsString()
  securityId!: string
}

@Controller('voting')
export class VotingController {
  constructor(private readonly votingService: VotingService) {}

  @Permissions('transfer.view', 'report.view')
  @Get('meetings')
  async listMeetings(@Query() query: MeetingListQuery) {
    return this.votingService.listMeetings(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Get('meetings/:id')
  async getMeeting(@Param('id') id: string) {
    return this.votingService.getMeeting(id)
  }

  @Permissions('agent.admin')
  @Post('meetings')
  async createMeeting(@Body() body: CreateMeetingDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.votingService.createMeeting(body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Patch('meetings/:id')
  async updateMeeting(
    @Param('id') id: string,
    @Body() body: UpdateMeetingDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.votingService.updateMeeting(id, body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post('meetings/:id/proposals')
  async upsertProposals(
    @Param('id') id: string,
    @Body() body: BulkProposalsDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.votingService.upsertProposals(id, body, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post('meetings/:id/open')
  async open(
    @Param('id') id: string,
    @Body() body: OpenMeetingDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.votingService.openMeeting(id, body.securityId, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post('meetings/:id/close')
  async close(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.votingService.closeMeeting(id, actorFromRequest(request))
  }

  @Permissions('agent.admin')
  @Post('meetings/:id/certify')
  async certify(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.votingService.certifyMeeting(id, actorFromRequest(request))
  }

  @Permissions('transfer.view', 'report.view')
  @Get('meetings/:id/tallies')
  async tallies(@Param('id') id: string) {
    return this.votingService.tallyMeeting(id)
  }

  @Permissions('transfer.view', 'report.view')
  @Get('ballots')
  async listBallots(@Query() query: BallotListQuery) {
    return this.votingService.listBallots(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Get('ballots/:id')
  async getBallot(@Param('id') id: string) {
    return this.votingService.getBallotDetail(id)
  }

  @Permissions('shareholder.transfer.create', 'transfer.view')
  @Post('ballots/:id/submit')
  async submitBallot(
    @Param('id') id: string,
    @Body() body: SubmitBallotDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.votingService.submitBallot(id, body, actorFromRequest(request))
  }
}
