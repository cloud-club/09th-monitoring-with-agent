import { Injectable } from '@nestjs/common';

type PaymentPgFormatIssueState = {
	enabled: boolean;
	updatedAt: string;
};

@Injectable()
export class IssueService {
	private paymentPgFormatIssue: PaymentPgFormatIssueState = {
		enabled: false,
		updatedAt: new Date().toISOString(),
	};

	public setPaymentPgFormatIssue(enabled: boolean): PaymentPgFormatIssueState {
		this.paymentPgFormatIssue = {
			enabled,
			updatedAt: new Date().toISOString(),
		};
		return this.paymentPgFormatIssue;
	}

	public getPaymentPgFormatIssue(): PaymentPgFormatIssueState {
		return this.paymentPgFormatIssue;
	}
}
