import { Link } from 'react-router-dom';

export default function LearnMore() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-xl font-bold">AI Learning Buddy</h1>
        <Link
          to="/"
          aria-label="Back to Home"
          className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
        >
          &larr; Back to Home
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        <section aria-labelledby="project-overview">
          <h2 id="project-overview" className="text-3xl font-bold tracking-tight mb-4">
            Project Overview
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            AI Learning Buddy is an interactive companion designed to help learners explore new
            topics with personalized guidance. It adapts to your pace, surfaces relevant content,
            and provides clear explanations so you can build confidence in any subject area.
          </p>
        </section>

        <section aria-labelledby="key-features">
          <h2 id="key-features" className="text-3xl font-bold tracking-tight mb-4">
            Key Features
          </h2>
          <ul className="list-disc pl-6 space-y-2 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            <li>Personalized learning paths tailored to your goals and skill level.</li>
            <li>Interactive Q&amp;A with context-aware AI explanations.</li>
            <li>Progress tracking with milestones and gentle reminders.</li>
            <li>Curated resources and recommended next steps for every topic.</li>
          </ul>
        </section>

        <section aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-3xl font-bold tracking-tight mb-4">
            How It Works
          </h2>
          <ol className="list-decimal pl-6 space-y-2 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            <li>Tell the buddy what you want to learn and your current familiarity with the topic.</li>
            <li>Receive a customized plan with bite-sized lessons and example questions.</li>
            <li>Engage in conversation to clarify concepts, get hints, and reinforce understanding.</li>
            <li>Review progress and unlock more advanced material as you complete each step.</li>
          </ol>
        </section>

        <section aria-labelledby="benefits">
          <h2 id="benefits" className="text-3xl font-bold tracking-tight mb-4">
            Benefits
          </h2>
          <ul className="list-disc pl-6 space-y-2 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            <li>Learn at your own pace without judgement or pressure.</li>
            <li>Save time with focused, relevant content instead of endless searching.</li>
            <li>Strengthen retention through active dialogue and spaced reinforcement.</li>
            <li>Gain a trusted study partner that is available whenever inspiration strikes.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
