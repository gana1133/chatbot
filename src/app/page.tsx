"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type ModelOption = {
	key: string;
	label: string;
};

type ColumnState = {
	model: string;
	content: string;
	isLoading: boolean;
	isError: boolean;
	selectedBest: boolean;
};

const DEFAULT_MODELS: ModelOption[] = [
	{ key: "openai/gpt-5", label: "GPT-5" },
	{ key: "anthropic/claude-4-sonnet", label: "Claude 4 Sonnet" },
	{ key: "google/gemini-2.5-pro", label: "Gemini 2.5" },
	{ key: "deepseek/deepseek-chat", label: "DeepSeek" },
];

export default function Home() {
	const [availableModels] = useState<ModelOption[]>(DEFAULT_MODELS);
	const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>([
		DEFAULT_MODELS[0].key,
		DEFAULT_MODELS[1].key,
		DEFAULT_MODELS[2].key,
	]);
	const [columns, setColumns] = useState<Record<string, ColumnState>>(() => {
		const initial: Record<string, ColumnState> = {};
		for (const key of selectedModelKeys) {
			initial[key] = {
				model: key,
				content: "",
				isLoading: false,
				isError: false,
				selectedBest: false,
			};
		}
		return initial;
	});
	const [prompt, setPrompt] = useState("");
	const controllerRef = useRef<AbortController | null>(null);

	const selectedModels = useMemo(
		() => availableModels.filter((m) => selectedModelKeys.includes(m.key)),
		[availableModels, selectedModelKeys]
	);

	const gridColsClass = useMemo(() => {
		const count = selectedModels.length || 1;
		if (count <= 1) return "grid-cols-1";
		if (count === 2) return "grid-cols-1 md:grid-cols-2";
		if (count === 3) return "grid-cols-1 md:grid-cols-3";
		return "grid-cols-1 md:grid-cols-4";
	}, [selectedModels.length]);

	const startCompare = useCallback(async () => {
		if (!prompt.trim() || selectedModels.length === 0) return;
		controllerRef.current?.abort();
		controllerRef.current = new AbortController();

		setColumns((prev) => {
			const next: Record<string, ColumnState> = {};
			for (const { key } of selectedModels) {
				next[key] = {
					model: key,
					content: "",
					isLoading: true,
					isError: false,
					selectedBest: prev[key]?.selectedBest ?? false,
				};
			}
			return next;
		});

		try {
			const res = await fetch("/api/openrouter", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages: [{ role: "user", content: prompt }],
					models: selectedModels.map((m) => m.key),
					stream: true,
				}),
				signal: controllerRef.current.signal,
			});
			if (!res.ok || !res.body) {
				throw new Error("Failed to start streaming");
			}
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let done = false;
			let buffer = "";
			while (!done) {
				const { value, done: rdone } = await reader.read();
				done = rdone;
				if (value) {
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";
					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed) continue;
						try {
							const evt = JSON.parse(trimmed) as { type: string; model: string; data?: string; error?: string };
							if (evt.type === "chunk" && evt.model) {
								setColumns((prev) => ({
									...prev,
									[evt.model]: {
										...prev[evt.model],
										content: (prev[evt.model]?.content || "") + (evt.data || ""),
										isLoading: true,
										isError: false,
									},
								}));
							} else if (evt.type === "end" && evt.model) {
								setColumns((prev) => ({
									...prev,
									[evt.model]: { ...prev[evt.model], isLoading: false },
								}));
							} else if (evt.type === "error" && evt.model) {
								setColumns((prev) => ({
									...prev,
									[evt.model]: {
										...prev[evt.model],
										isLoading: false,
										isError: true,
										content: (prev[evt.model]?.content || "") + (evt.error ? `\n[Error] ${evt.error}` : ""),
									},
								}));
							}
						} catch {}
					}
				}
			}
		} catch (err) {
			setColumns((prev) => {
				const next: Record<string, ColumnState> = {};
				for (const { key } of selectedModels) {
					next[key] = {
						...prev[key],
						isLoading: false,
						isError: true,
						content: (prev[key]?.content || "") + "\n[Error] Failed to stream.",
					};
				}
				return next;
			});
		}
	}, [prompt, selectedModels]);

	const toggleModel = useCallback((key: string) => {
		setSelectedModelKeys((prev) => {
			if (prev.includes(key)) {
				const next = prev.filter((k) => k !== key);
				setColumns((c) => {
					const { [key]: _removed, ...rest } = c;
					return rest;
				});
				return next;
			}
			const next = [...prev, key].slice(0, 4);
			setColumns((c) => ({
				...c,
				[key]: {
					model: key,
					content: "",
					isLoading: false,
					isError: false,
					selectedBest: false,
				},
			}));
			return next;
		});
	}, []);

	const copyToClipboard = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			// no toast for now
		} catch {}
	}, []);

	const markBest = useCallback((key: string) => {
		setColumns((prev) => {
			const next: Record<string, ColumnState> = {};
			for (const k of Object.keys(prev)) {
				next[k] = { ...prev[k], selectedBest: k === key };
			}
			return next;
		});
	}, []);

	return (
		<div className="min-h-screen flex flex-col">
			<header className="border-b px-4 py-3 flex items-center justify-between gap-4">
				<h1 className="text-lg font-semibold">Model Compare</h1>
				<div className="flex flex-wrap items-center gap-2">
					{availableModels.map((m) => {
						const isActive = selectedModelKeys.includes(m.key);
						return (
							<button
								key={m.key}
								onClick={() => toggleModel(m.key)}
								className={`text-sm px-3 py-1.5 rounded border ${
									isActive
										? "bg-black text-white dark:bg-white dark:text-black"
										: "bg-transparent"
								}`}
								title={m.key}
							>
								{m.label}
							</button>
						);
					})}
				</div>
			</header>

			<main className={`grid ${gridColsClass} gap-4 p-4 grow`}>
				{selectedModels.map((m) => {
					const col = columns[m.key];
					return (
						<section key={m.key} className={`flex flex-col border rounded-md overflow-hidden ${col?.selectedBest ? "ring-2 ring-blue-500" : ""}`}>
							<div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 dark:bg-gray-900/40">
								<div className="text-sm font-medium truncate" title={m.key}>{m.label}</div>
								<div className="flex items-center gap-2">
									<button className="text-xs px-2 py-1 border rounded" onClick={() => markBest(m.key)}>Pick best</button>
									<button className="text-xs px-2 py-1 border rounded" onClick={() => copyToClipboard(col?.content || "")}>Copy</button>
								</div>
							</div>
							<div className="p-3 grow whitespace-pre-wrap text-sm overflow-auto">
								{col?.content || (col?.isLoading ? "" : "Awaiting input...")}
								{col?.isLoading && <span className="opacity-60">\n▍</span>}
							</div>
						</section>
					);
				})}
			</main>

			<footer className="border-t p-3">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						startCompare();
					}}
					className="flex items-center gap-2 max-w-5xl mx-auto"
				>
					<input
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="Type a message to send to all selected models..."
						className="flex-1 border rounded px-3 py-2 text-sm"
					/>
					<button type="submit" className="px-4 py-2 text-sm border rounded">Send</button>
					<button
						type="button"
						onClick={() => {
							controllerRef.current?.abort();
						}}
						className="px-3 py-2 text-sm border rounded"
					>
						Stop
					</button>
					<button
						type="button"
						onClick={() => copyToClipboard(prompt)}
						className="px-3 py-2 text-sm border rounded"
					>
						Copy prompt
					</button>
				</form>
			</footer>
		</div>
	);
}
