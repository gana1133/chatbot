import { NextRequest } from "next/server";

type ChatRequest = {
	messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
	models: string[];
	temperature?: number;
	maxTokens?: number;
};

export const runtime = "edge";

export async function POST(req: NextRequest) {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return new Response("Missing OPENROUTER_API_KEY", { status: 500 });
	}

	let body: ChatRequest;
	try {
		body = (await req.json()) as ChatRequest;
	} catch (e) {
		return new Response("Invalid JSON body", { status: 400 });
	}

	const { messages, models, temperature = 0.7, maxTokens } = body;
	if (!messages?.length || !models?.length) {
		return new Response("'messages' and 'models' are required", { status: 400 });
	}

	// Fan-out requests to each model and stream back NDJSON events
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			(async () => {
				await Promise.all(
					models.map(async (model) => {
						try {
							const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
								method: "POST",
								headers: {
									Authorization: `Bearer ${apiKey}`,
									"Content-Type": "application/json",
									"HTTP-Referer": req.headers.get("referer") || "",
									"X-Title": "Model Compare",
								},
								body: JSON.stringify({
									model,
									messages,
									stream: true,
									temperature,
									max_tokens: maxTokens,
								}),
							});

							if (!res.ok || !res.body) {
								const errText = await res.text().catch(() => res.statusText);
								controller.enqueue(
									encoder.encode(
										JSON.stringify({ type: "error", model, error: errText }) + "\n"
									)
								);
								return;
							}

							const reader = res.body.getReader();
							const decoder = new TextDecoder();
							let done = false;
							let buffer = "";

							while (!done) {
								const { value, done: readerDone } = await reader.read();
								done = readerDone;
								if (value) {
									buffer += decoder.decode(value, { stream: true });
									const lines = buffer.split("\n");
									buffer = lines.pop() || "";
									for (const line of lines) {
										const trimmed = line.trim();
										if (!trimmed) continue;
										// OpenRouter uses SSE-style lines: data: {json}
										const jsonPart = trimmed.startsWith("data:")
											? trimmed.slice(5).trim()
											: trimmed;

										if (jsonPart === "[DONE]") continue;

										try {
											const parsed = JSON.parse(jsonPart);
											const delta =
												parsed?.choices?.[0]?.delta?.content ||
												parsed?.choices?.[0]?.message?.content ||
												"";

											if (delta) {
												controller.enqueue(
													encoder.encode(
														JSON.stringify({ type: "chunk", model, data: delta }) + "\n"
													)
												);
											}
										} catch (err: any) {
											controller.enqueue(
												encoder.encode(
													JSON.stringify({
														type: "error",
														model,
														error: String(err),
													}) + "\n"
												)
											);
										}
									}
								}
							}

							if (buffer) {
								controller.enqueue(
									encoder.encode(
										JSON.stringify({ type: "chunk", model, data: buffer }) + "\n"
									)
								);
							}

							controller.enqueue(
								encoder.encode(JSON.stringify({ type: "end", model }) + "\n")
							);
						} catch (err: any) {
							controller.enqueue(
								encoder.encode(
									JSON.stringify({ type: "error", model, error: String(err) }) + "\n"
								)
							);
						}
					})
				);
				controller.close();
			})();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-cache",
		},
		status: 200,
	});
}


