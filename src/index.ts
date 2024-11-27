import { Memory, TranscriptSegment, TranscriptSession } from "./interfaces";
import { AzureOpenAI } from 'openai';

let openai: AzureOpenAI;
let env: Env;

async function init(newEnv: Env) {
	env = newEnv;
	openai = openai || new AzureOpenAI({
		apiKey: env.OPENAI_API_KEY,
		apiVersion: '2024-10-01-preview',
		endpoint: 'https://chimnie.openai.azure.com/',
		deployment: 'gpt-4o',
	});
}

async function getAllTasks(uid: string) {
	const currentTasksStmt = await env.DB.prepare(
		`SELECT tasks FROM all_tasks WHERE user_id = ?`
	);
	const currentTasksResult = await currentTasksStmt.bind(uid).first();
	return currentTasksResult?.tasks as string || 'No tasks.';
}

async function processMemory(memory: Memory, uid: string) {
	const currentTasks = await getAllTasks(uid);
	const fullTranscript = memory.transcript_segments.map(segment => segment.text).join(' ');

	const completion = await openai.chat.completions.create({
		messages: [
			{
				role: "system",
				content: `You are an AI assistant. Your task is to update a list of tasks based on a given list of existing tasks and a transcript of a user's voice input. The voice input may contain new tasks or information about the existing tasks, such as their completion status. Your goal is to generate an updated list of tasks, ordered by importance, with a focus on improving the user's personal productivity and life satisfaction, ensuring they remain productive without getting burned out.

Here are the steps you should follow:

1. **Review the Existing Tasks:** Start by examining the provided list of existing tasks.
2. **Analyze the Transcript:** Carefully read through the transcript to identify any new tasks or updates to existing tasks.
3. **Update the Task List:**
   - If a task is marked as completed in the transcript, remove it from the list.
   - If a new task is mentioned, add it to the list.
   - If there are updates to the importance or details of existing tasks, modify them accordingly.
4. **Order by Importance:** Arrange the tasks in order of importance, with the most important tasks at the top. Prioritize tasks that contribute to the user's personal productivity and life satisfaction, and ensure a balance to prevent burnout.
5. **Output the Updated List:** Provide the updated list of tasks as a numbered list, with each task on a new line.

**Edge Cases to Consider:**
- If a task is mentioned as both completed and still pending, prioritize the completion status.
- If the importance of a task is ambiguous, use your best judgment based on the context provided.
- Multiple Tasks in One Sentence: Split these into separate tasks if they are distinct and actionable.
- If an existing task is not mentioned, keep it in the list but reorder it according to other new tasks and updates as necessary.
- If no new tasks or updates are found in the transcript, return the original list of tasks without changes.

**Output Format:**
- The output should be a numbered list of tasks, with each task on a new line.
- Do not include any additional text or explanations, only the numbered list.

**Example Input:**

**Existing Tasks:**
1. Finish the project report
2. Call the client
3. Schedule a team meeting
4. Go for a run
5. Read a book

**Transcript:**
"I have completed the project report. We need to prepare a presentation for the client. Also, don't forget to call the client and schedule a team meeting. I should also make time to go for a run and read a book."

**Example Output:**
1. Prepare a presentation for the client
2. Call the client
3. Schedule a team meeting
4. Go for a run
5. Read a book

**Your task is to follow these instructions and generate the updated list of tasks.**`
			},
			{
				role: "user",
				content: `**Existing Tasks:**\n${currentTasks}\n\n**Transcript:**\n"${fullTranscript}"`
			}
		],
		model: 'gpt-4o',
	});

	const extractedTasks = completion.choices[0].message.content;

	// Only save if tasks have changed
	if (extractedTasks !== currentTasks) {
		const stmt = await env.DB.prepare(
			`INSERT INTO all_tasks (user_id, tasks)
		VALUES (?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
		tasks = excluded.tasks,
		updated_at = CURRENT_TIMESTAMP`
		);
		await stmt.bind(uid, extractedTasks).run();

		// Compare tasks ignoring the numbers at the start of each line
		const oldTasksNormalized = currentTasks.split('\n').map(task => task.replace(/^\d+\.\s*/, ''));
		const newTasksNormalized = (extractedTasks || '').split('\n').map(task => task.replace(/^\d+\.\s*/, ''));

		// Find new tasks by comparing normalized versions
		const newlyAddedTasks = newTasksNormalized.filter(task => !oldTasksNormalized.includes(task));

		if (newlyAddedTasks.length > 0) {
			return Response.json({
				message: `New tasks added:\n${newlyAddedTasks.map(task => `- ${task}`).join('\n')}.\n\nAsk tomorrow for your new 3 TOP tasks!`
			});
		}
	}

	// if no changes in tasks, just return
	return Response.json({
		status: 'success'
	});
}

async function processRealTimeTranscripts(transcripts: TranscriptSegment[], uid: string) {
	const fullTranscript = transcripts.map(segment => segment.text).join(' ');

	if (fullTranscript.toLowerCase().includes("3 tasks") ||
		fullTranscript.toLowerCase().includes("three tasks")) {

		let top3Tasks: string[] = [];
		const currentTop3TasksStmt = await env.DB.prepare(
			`SELECT tasks, updated_at FROM todays_tasks WHERE user_id = ?`
		);
		const currentTop3TasksResult = await currentTop3TasksStmt.bind(uid).first<{ tasks: string, updated_at: string }>();

		// Check if tasks need to be updated (no entry or last updated yesterday or earlier)
		const needsUpdate = !currentTop3TasksResult ||
			new Date(currentTop3TasksResult.updated_at).getTime() < new Date().setHours(0, 0, 0, 0);

		if (needsUpdate) {
			const allTasks = await getAllTasks(uid);

			if (!allTasks.length || allTasks.includes('No tasks')) {
				return Response.json({
					message: "No tasks found. Talk with Omi and add some!"
				});
			}

			top3Tasks = allTasks?.split('\n').slice(0, 3) || [];

			const stmt = await env.DB.prepare(
				`INSERT INTO todays_tasks (user_id, tasks)
				VALUES (?, ?)
				ON CONFLICT(user_id) DO UPDATE SET
				tasks = excluded.tasks,
				updated_at = CURRENT_TIMESTAMP`
			);
			await stmt.bind(uid, top3Tasks.join('\n')).run();
		}

		if (!top3Tasks?.length) {
			top3Tasks = currentTop3TasksResult?.tasks.split('\n').slice(0, 3) || [];
		}

		if (top3Tasks.length > 0) {
			const endings = [
				"You can do it!",
				"You've got this!",
				"Believe in yourself!",
				"Make it happen!",
				"Today is your day!",
				"Small steps lead to big wins!",
				"One task at a time - you'll get there!",
				"Stay focused and crush it!",
				"You're capable of amazing things!",
				"Let's make today count!"
			];
			const ending = endings[Math.floor(Math.random() * endings.length)];
			return Response.json({
				message: `Your TOP 3 tasks for today:\n\n${top3Tasks.join('\n')}.\n\n${ending}`
			});
		} else {
			return Response.json({
				message: "No TOP 3 tasks found. Talk with Omi and add some!"
			});
		}
	}

	return Response.json({
		status: 'success'
	});
}

export default {
	async fetch(request: Request, newEnv: Env, ctx: ExecutionContext): Promise<Response> {
		await init(newEnv);

		const content = await request.json<Memory | TranscriptSession>();

		//console.log('Recieved request', content);

		try {
			const url = new URL(request.url);
			const uid = url.searchParams.get('uid');
			if (!uid) {
				throw new Error('User ID is required');
			}

			if ('session_id' in content) {
				return processRealTimeTranscripts(content.segments, uid);
			} else if ('status' in content && content.status == 'completed') {
				return processMemory(content, uid);
			}
		} catch (error) {
			return Response.json({
				status: 'error',
				message: 'Top 3 Tasks error: ' + (error instanceof Error ? error.message : 'Unknown error')
			});
		}

		return Response.json({
			status: 'success'
		});
	},
} satisfies ExportedHandler<Env>;
