import { Module } from '@nestjs/common';

// Same module graph as apps/api (ADR-0013): Phase 2 imports the identical
// modules/* composition here, then starts schedulers and the outbox relay
// instead of the HTTP adapter. Phase 1: the graph is empty.
@Module({})
export class AppModule {}
