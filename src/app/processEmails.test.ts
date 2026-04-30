import { describe, it, expect } from 'vitest';
import { buildPreviewText, createFailedProcessedEmail, sortProcessedEmails } from './processEmails';
import type { ActionDeskResult, EmailItem } from '../types/actionDesk';

const mockEmail: EmailItem = {
  id: '1',
  senderName: 'John',
  senderEmail: 'john@test.com',
  subject: 'Test',
  receivedAt: new Date().toISOString(),
  body: 'Hello world'
};

const mockResult: ActionDeskResult = {
  analysis: {
    summary: 'Summary text',
    intent: 'general_support',
    urgency: 'low',
    confidence: 'high',
    risks: [],
    nextAction: 'Reply'
  },
  analysisSource: 'ai',
  replyDraft: 'Reply',
  priorityScore: 10
};

describe('buildPreviewText', () => {
  it('uses summary when available', () => {
    const preview = buildPreviewText(mockResult, mockEmail);
    expect(preview).toBe('Summary text');
  });
});

describe('createFailedProcessedEmail', () => {
  it('creates failed item with fallback preview', () => {
    const failed = createFailedProcessedEmail(mockEmail);
    expect(failed.status).toBe('failed');
    expect(failed.previewText).toContain('Hello world');
  });
});

describe('sortProcessedEmails', () => {
  it('prioritizes processed over failed', () => {
    const processed = {
      email: mockEmail,
      status: 'processed' as const,
      result: mockResult,
      issueCount: 0,
      previewText: 'ok'
    };

    const failed = createFailedProcessedEmail(mockEmail);

    const sorted = sortProcessedEmails([failed, processed]);
    expect(sorted[0].status).toBe('processed');
  });
});
