/**
 * ConsentDocumentContentApiModule — the document-CONTENT route, mounted
 * separately from ConsentApiModule.
 *
 * Separate because its dependency set is separate: the content path needs a
 * content source and a digest that no other consent endpoint has any business
 * holding, and the §49 flows (acceptance, withdrawal, status) must not gain a
 * reference to the bytes. Keeping them apart also means a composition cannot
 * mount the consent flows and silently acquire a content path it never bound a
 * source for.
 *
 * The composition root constructs the use case over the legal-document
 * repository, the operating-entity directory, the content source it has (in
 * this phase: the one that honestly has none), and the sha256 digest, then
 * imports `ConsentDocumentContentApiModule.register(...)`.
 */

import { Module, type DynamicModule } from '@nestjs/common';

import {
  CONSENT_DOCUMENT_CONTENT_USE_CASES,
  ConsentDocumentContentController,
  type ConsentDocumentContentUseCases,
} from './document-content.controller.js';

@Module({})
export class ConsentDocumentContentApiModule {
  static register(useCases: ConsentDocumentContentUseCases): DynamicModule {
    return {
      module: ConsentDocumentContentApiModule,
      controllers: [ConsentDocumentContentController],
      providers: [{ provide: CONSENT_DOCUMENT_CONTENT_USE_CASES, useValue: useCases }],
    };
  }
}
