// test/index.spec.ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { Env } from '../src/index';
import { memoryRequest, transcriptSessionRequest } from './requests';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock('openai', () => {
	return {
		AzureOpenAI: vi.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue({
						choices: [
							{
								message: {
									content: "1. Buy milk\n2. Call mom\n3. Go for a run"
								}
							}
						]
					})
				}
			}
		}))
	};
});

describe('Top 3 Tasks worker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const testEnv: Env = {
		...env,
		DB: {
			prepare: () => ({
				bind: () => ({
					first: () => Promise.resolve({
						tasks: "1. Most important task 1\n2. Slightly less important task 2\n3. A bit important task 3\n4. Less important task",
						updated_at: new Date().toISOString()
					}),
					// @ts-expect-error
					run: () => Promise.resolve()
				})
			})
		},
		OPENAI_API_KEY: 'test-key'
	};

	it('handles memory request', async () => {
		const request = new IncomingRequest('http://example.com?uid=test-user', {
			method: 'POST',
			body: JSON.stringify(memoryRequest)
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result = (await response.json()) as { message: string };
		expect(result).toHaveProperty('message');
		expect(result.message).toContain('New tasks added');
	});

	it('handles transcript session request', async () => {
		const request = new IncomingRequest('http://example.com?uid=test-user', {
			method: 'POST',
			body: JSON.stringify(transcriptSessionRequest)
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result = (await response.json()) as { status: string };
		expect(result).toHaveProperty('status');
		expect(result.status).toBe('success');
	});

	it('requires user ID', async () => {
		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			body: JSON.stringify(memoryRequest)
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result = await response.json() as { status: string; message: string };
		expect(result).toHaveProperty('status', 'error');
		expect(result.message).toContain('User ID is required');
	});

	it('handles "3 tasks" magic word in transcript', async () => {
		const magicWordRequest = {
			...transcriptSessionRequest,
			segments: [{
				...transcriptSessionRequest.segments[0],
				text: "What are my 3 tasks for today?"
			}]
		};

		const request = new IncomingRequest('http://example.com?uid=test-user', {
			method: 'POST',
			body: JSON.stringify(magicWordRequest)
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result = await response.json() as { message: string };
		expect(result).toHaveProperty('message');
		expect(result.message).toContain('Your TOP 3 tasks for today');
		expect(result.message).toContain('Most important task 1');
		expect(result.message).toContain('Slightly less important task 2');
		expect(result.message).toContain('A bit important task 3');
	});

	it('handles "three tasks" magic word in transcript', async () => {
		const magicWordRequest = {
			...transcriptSessionRequest,
			segments: [{
				...transcriptSessionRequest.segments[0],
				text: "Show me my three tasks"
			}]
		};

		const request = new IncomingRequest('http://example.com?uid=test-user', {
			method: 'POST',
			body: JSON.stringify(magicWordRequest)
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);

		const result = await response.json() as { message: string };
		expect(result).toHaveProperty('message');
		expect(result.message).toContain('Your TOP 3 tasks for today');
	});

	it('handles case when no tasks exist', async () => {
		const testEnvNoTasks: Env = {
			...testEnv,
			DB: {
				prepare: () => ({
					bind: () => ({
						first: () => Promise.resolve({
							tasks: "No tasks.",
							updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
						}),
						// @ts-expect-error
						run: () => Promise.resolve()
					})
				})
			}
		};

		const magicWordRequest = {
			...transcriptSessionRequest,
			segments: [{
				...transcriptSessionRequest.segments[0],
				text: "What are my 3 tasks?"
			}]
		};

		const request = new IncomingRequest('http://example.com?uid=test-user', {
			method: 'POST',
			body: JSON.stringify(magicWordRequest)
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnvNoTasks, ctx);
		await waitOnExecutionContext(ctx);

		const result = await response.json() as { message: string };
		expect(result).toHaveProperty('message');
		expect(result.message).toContain('No tasks');
	});

});
