describe('backend live integration', () => {
	const isLiveMode = process.env.LIVE_TEST === 'true';

	if (!isLiveMode) {
		it('stays disabled unless LIVE_TEST=true', () => {
			expect(process.env.LIVE_TEST).not.toBe('true');
		});

		return;
	}

	it('checks a real backend target through the public health endpoint', async () => {
		const liveBaseUrl = process.env.BACKEND_LIVE_BASE_URL;

		if (!liveBaseUrl) {
			throw new Error('BACKEND_LIVE_BASE_URL is required when LIVE_TEST=true');
		}

		const response = await fetch(`${liveBaseUrl.replace(/\/$/, '')}/health`);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			data: {
				status: 'ok',
			},
		});
	});
});
