import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">AI Learning Buddy</h1>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-16 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Your AI Learning Buddy
        </h2>
        <p className="text-lg text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
          A personalized learning companion that helps you master new concepts at your own pace.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
          >
            Get Started
          </Link>
          <Link
            to="/learn-more"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-medium text-slate-900 dark:text-slate-100 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
          >
            Learn More
          </Link>
        </div>
      </main>
    </div>
  );
}
