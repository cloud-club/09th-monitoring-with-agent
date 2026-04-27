import type { EmailMessage, EmailTransport, EmailTransportResult } from './notification.types';

export class NoopEmailTransport implements EmailTransport {
	public async send(_message: EmailMessage): Promise<EmailTransportResult> {
		return {
			accepted: true,
			providerMessageId: 'noop',
		};
	}
}
