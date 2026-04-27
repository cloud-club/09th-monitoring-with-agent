import type { SmtpConfig } from './notification.config';
import type { EmailMessage, EmailTransport, EmailTransportResult } from './notification.types';

import { Buffer } from 'node:buffer';
import net from 'node:net';
import tls from 'node:tls';

type Socket = net.Socket | tls.TLSSocket;

function encodeHeader(value: string): string {
	if (/^[\x20-\x7E]*$/.test(value)) {
		return value;
	}

	return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function extractAddress(value: string): string {
	const match = /<([^>]+)>/.exec(value);
	return match?.[1] ?? value;
}

function dotStuff(value: string): string {
	return value
		.replace(/\r?\n/g, '\r\n')
		.split('\r\n')
		.map(line => line.startsWith('.') ? `.${line}` : line)
		.join('\r\n');
}

function buildMimeMessage(config: SmtpConfig, message: EmailMessage): string {
	const boundary = `mwa-${Date.now().toString(36)}`;
	return [
		`From: ${config.from}`,
		`To: ${message.to.join(', ')}`,
		`Subject: ${encodeHeader(message.subject)}`,
		'MIME-Version: 1.0',
		`Content-Type: multipart/alternative; boundary="${boundary}"`,
		'',
		`--${boundary}`,
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: 8bit',
		'',
		message.text,
		`--${boundary}`,
		'Content-Type: text/html; charset=UTF-8',
		'Content-Transfer-Encoding: 8bit',
		'',
		message.html,
		`--${boundary}--`,
		'',
	].join('\r\n');
}

class SmtpSession {
	private buffer = '';
	private readonly pending: Array<(line: string) => void> = [];

	public constructor(private readonly socket: Socket) {
		this.socket.on('data', (chunk: Buffer) => {
			this.buffer += chunk.toString('utf8');
			this.flushLines();
		});
	}

	public async expect(expectedPrefix: string): Promise<string> {
		const line = await this.readResponse();
		if (!line.startsWith(expectedPrefix)) {
			throw new Error(`SMTP expected ${expectedPrefix}, received ${line}`);
		}

		return line;
	}

	public async command(command: string, expectedPrefix: string): Promise<string> {
		this.socket.write(`${command}\r\n`);
		return this.expect(expectedPrefix);
	}

	public close(): void {
		this.socket.end();
	}

	private flushLines(): void {
		let lineEnd = this.buffer.indexOf('\n');
		while (lineEnd !== -1 && this.pending.length > 0) {
			const rawLine = this.buffer.slice(0, lineEnd + 1);
			this.buffer = this.buffer.slice(lineEnd + 1);
			lineEnd = this.buffer.indexOf('\n');
			const line = rawLine.trimEnd();
			if (/^\d{3}-/.test(line)) {
				continue;
			}

			const resolve = this.pending.shift();
			resolve?.(line);
		}
	}

	private async readResponse(): Promise<string> {
		return new Promise((resolve, reject) => {
			const onError = (error: Error): void => {
				this.socket.off('error', onError);
				reject(error);
			};
			this.socket.once('error', onError);
			this.pending.push((line) => {
				this.socket.off('error', onError);
				resolve(line);
			});
			this.flushLines();
		});
	}
}

export class SmtpEmailTransport implements EmailTransport {
	public constructor(private readonly config: SmtpConfig) {}

	public async send(message: EmailMessage): Promise<EmailTransportResult> {
		try {
			await this.deliver(message);
			return { accepted: true };
		}
		catch (error) {
			return {
				accepted: false,
				failureReason: error instanceof Error ? error.message : 'SMTP delivery failed',
			};
		}
	}

	private async deliver(message: EmailMessage): Promise<void> {
		const socket = await this.connect();
		const session = new SmtpSession(socket);
		try {
			await session.expect('220');
			await session.command('EHLO mwa-backend.local', '250');
			if (this.config.user !== undefined && this.config.password !== undefined) {
				await session.command('AUTH LOGIN', '334');
				await session.command(Buffer.from(this.config.user, 'utf8').toString('base64'), '334');
				await session.command(Buffer.from(this.config.password, 'utf8').toString('base64'), '235');
			}
			await session.command(`MAIL FROM:<${extractAddress(this.config.from)}>`, '250');
			for (const recipient of message.to) {
				await session.command(`RCPT TO:<${recipient}>`, '250');
			}
			await session.command('DATA', '354');
			socket.write(`${dotStuff(buildMimeMessage(this.config, message))}\r\n.\r\n`);
			await session.expect('250');
			await session.command('QUIT', '221');
		}
		finally {
			session.close();
		}
	}

	private async connect(): Promise<Socket> {
		return new Promise((resolve, reject) => {
			const socket = this.config.secure
				? tls.connect({ host: this.config.host, port: this.config.port })
				: net.connect({ host: this.config.host, port: this.config.port });
			const timeout = setTimeout(() => {
				socket.destroy();
				reject(new Error('SMTP connection timed out'));
			}, 10000);

			socket.once('connect', () => {
				clearTimeout(timeout);
				resolve(socket);
			});
			socket.once('error', (error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});
	}
}
