import type { EmailNotifierConfig } from './notification.config';
import type { EmailTransport } from './notification.types';

export const EMAIL_NOTIFIER_CONFIG = Symbol('EMAIL_NOTIFIER_CONFIG');
export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

export type EmailNotifierConfigToken = EmailNotifierConfig;
export type EmailTransportToken = EmailTransport;
