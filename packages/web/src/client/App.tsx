import { useState } from "react";

function App() {
	const [count, setCount] = useState(0);

	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center">
			<div className="max-w-2xl mx-auto p-8 bg-white rounded-lg shadow-lg">
				<h1 className="text-4xl font-bold text-gray-900 mb-4">lil — personal AI assistant</h1>
				<p className="text-gray-600 mb-6">Web UI coming soon...</p>

				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={() => setCount((c) => c + 1)}
						className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
					>
						Count: {count}
					</button>
					<p className="text-sm text-gray-500">Testing React + Tailwind</p>
				</div>
			</div>
		</div>
	);
}

export default App;
