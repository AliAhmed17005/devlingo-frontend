import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LandingPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col font-body transition-colors duration-300">
      {/* Sleek Premium Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 backdrop-blur-md border-b border-outline-variant/10 bg-surface/80">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-tertiary flex items-center justify-center shadow-lg">
            <span className="material-symbols-outlined text-white text-lg">terminal</span>
          </div>
          <span className="font-headline font-extrabold text-xl tracking-tight text-on-surface">
            Dev<span className="text-primary">Lingo</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-surface-variant/20 transition-all text-on-surface-variant"
            title="Toggle theme"
          >
            {isDark ? "☀️" : "🌙"}
          </button>

          {currentUser ? (
            <Link
              to="/dashboard"
              className="bg-gradient-to-r from-primary to-primary-dim text-on-primary text-sm font-bold px-5 py-2.5 rounded-lg shadow-lg hover:scale-105 active:scale-95 transition-all"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="text-on-surface hover:text-primary text-sm font-medium px-4 py-2 transition-all"
              >
                Log In
              </Link>
              <Link
                to="/signup"
                className="bg-gradient-to-r from-primary to-primary-dim text-on-primary text-sm font-bold px-5 py-2.5 rounded-lg shadow-lg hover:scale-105 active:scale-95 transition-all"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="pt-24 font-body text-on-surface flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden flex items-center px-8 py-24">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center w-full">
            <div className="z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high mb-6 border border-primary/10">
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <span className="font-label text-xs tracking-wider uppercase text-tertiary">v2.0 Sandbox Live</span>
              </div>
              <h1 className="font-headline text-5xl md:text-7xl font-extrabold text-on-surface leading-[1.1] tracking-tight mb-8">
                Learn Python.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-dim to-tertiary">At Your Pace.</span><br />
                Your Way.
              </h1>
              <p className="font-body text-lg md:text-xl text-on-surface-variant max-w-xl mb-10 leading-relaxed">
                Experience AI-personalized learning roadmaps that adapt to your progress. Compile and run Python locally inside a secure browser sandbox, with no server costs or setup needed.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to={currentUser ? "/dashboard" : "/signup"}
                  className="bg-gradient-to-r from-primary to-primary-dim text-on-primary text-lg font-bold px-10 py-4 rounded-xl shadow-[0_0_40px_rgba(186,158,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all text-center"
                >
                  Get Started Free
                </Link>
                <button 
                  onClick={() => navigate("/login")}
                  className="flex items-center justify-center gap-2 bg-surface-variant/20 border border-primary/20 text-on-surface px-10 py-4 rounded-xl hover:bg-surface-variant/40 transition-all backdrop-blur-sm"
                >
                  <span className="material-symbols-outlined">play_circle</span>
                  Log In
                </button>
              </div>
            </div>

            {/* Interactive Code Visualizer */}
            <div className="relative hidden lg:block">
              <div className="relative glass-card border border-outline-variant/30 rounded-xl p-6 shadow-2xl z-20 translate-x-12 translate-y-8 bg-surface-container">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <pre className="font-label text-sm text-primary-fixed leading-relaxed">
                  <code>
                    <span className="text-tertiary">function</span> <span className="text-secondary">runPythonSandbox</span>() {'{\n'}
                    {'  '}<span className="text-primary">const</span> worker = <span className="text-tertiary-fixed">loadPyodideWorker</span>();{'\n'}
                    {'  '}<span className="text-primary">return</span> worker.<span className="text-tertiary">runPython</span>(code, {'{\n'}
                    {'    '}difficulty: <span className="text-secondary-fixed">'adaptive'</span>,{'\n'}
                    {'    '}timeout: <span className="text-secondary-fixed">'5000ms'</span>{'\n'}
                    {'  }'});{'\n'}
                    {'}'}
                  </code>
                </pre>
              </div>
              
              <div className="absolute -top-12 -left-8 glass-card border border-outline-variant/30 rounded-xl p-6 w-64 shadow-2xl z-10 bg-surface-container-high">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">psychology</span>
                  </div>
                  <div>
                    <p className="text-xs font-label text-outline">AI ENGINE</p>
                    <p className="text-sm font-bold text-on-surface">Curriculum Optimized</p>
                  </div>
                </div>
                <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[85%]" />
                </div>
              </div>

              <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent blur-3xl rounded-full" />
            </div>
          </div>
        </section>

        {/* Feature Section */}
        <section className="bg-surface-container-low py-24 px-8 relative overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16 text-center">
              <h2 className="font-headline text-3xl md:text-5xl font-bold mb-4 tracking-tight">The Future of Coding Education</h2>
              <p className="text-on-surface-variant max-w-2xl mx-auto">Our platform uses adaptive evaluation algorithms and client-side compilation threads to customize your coding progress.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: 'dynamic_form', color: 'primary', title: 'Adaptive AI Path', desc: 'Tailored roadmaps that evolve with you. As you complete lessons, DevLingo adjusts questions between Easy, Medium, and Hard to keep you in the flow state.' },
                { icon: 'quiz', color: 'tertiary', title: 'Aria AI Tutor', desc: 'Guided discovery through Aria. If OpenAI keys hit limits, Aria automatically falls back to Gemini free tier and offline regex engines to guarantee zero downtime.' },
                { icon: 'analytics', color: 'secondary', title: 'In-Browser Execution', desc: 'Compile Python locally on your CPU using Pyodide and Web Workers. Bypasses server bottlenecks, reduces latency, and terminates infinite loops after 5s.' },
              ].map((feature) => (
                <div key={feature.title} className="group bg-surface-container-high p-8 rounded-xl border border-outline-variant/10 hover:border-primary/30 transition-all duration-500">
                  <div className="w-14 h-14 rounded-lg bg-surface-container flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-3xl text-primary">{feature.icon}</span>
                  </div>
                  <h3 className="font-headline text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="font-body text-on-surface-variant leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Synthetic Architect Section */}
        <section className="py-24 px-8 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="bg-surface-container-low rounded-2xl p-10 relative overflow-hidden h-[400px] flex flex-col justify-start border border-outline-variant/10">
              <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4 z-10 relative">The Pyodide WASM Architecture</h2>
              <p className="text-on-surface-variant font-body z-10 relative max-w-md">Our compiler operates inside a background Web Worker thread. This lets you run code instantly in your browser sandbox without remote server vulnerabilities.</p>
              <div className="absolute -bottom-10 -right-20 opacity-[0.15] w-full h-full pointer-events-none text-[8px] leading-tight font-mono text-primary rotate-[-15deg] overflow-hidden whitespace-pre">
                {Array(40).fill("function devLingoAI(user) { return buildPath(user.skills, optimalSpeed); }\nclass Solution { def resolve(node): return node.next }").join("\n")}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-transparent to-transparent z-0 pointer-events-none" />
            </div>
            
            <div className="space-y-8">
              <div className="flex items-center justify-between border-b border-outline-variant/10 pb-8">
                <div>
                  <h3 className="font-headline text-5xl font-black text-tertiary tracking-tight">0s</h3>
                  <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant mt-1">Server Wait Time</p>
                </div>
                <span className="material-symbols-outlined text-5xl text-outline-variant/20">trending_up</span>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10">
                  <span className="material-symbols-outlined text-secondary mb-4 text-2xl">school</span>
                  <h4 className="font-headline text-lg font-bold mb-2">AI-Powered</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed">Roadmaps designed by adaptive assessment algorithms.</p>
                </div>
                <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10">
                  <span className="material-symbols-outlined text-primary mb-4 text-2xl">desktop_windows</span>
                  <h4 className="font-headline text-lg font-bold mb-2">In-Browser Sandbox</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed">Run Python scripts locally with zero server hosting overhead.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-8 pb-32">
          <div className="max-w-4xl mx-auto bg-surface-container-low rounded-3xl p-16 text-center relative overflow-hidden border border-outline-variant/10">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <h2 className="font-headline text-4xl md:text-5xl font-extrabold mb-6 relative z-10">Ready to build the future?</h2>
            <p className="text-on-surface-variant font-body text-lg mb-10 relative z-10">Join student developers mastering Python with DevLingo's AI.</p>
            <Link
              to="/signup"
              className="inline-block bg-gradient-to-r from-primary to-primary-dim text-on-primary font-bold px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(186,158,255,0.2)] hover:scale-105 active:scale-95 transition-all relative z-10"
            >
              Get Started Now — It's Free
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
