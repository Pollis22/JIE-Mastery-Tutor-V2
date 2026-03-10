import { useState, useEffect } from "react";
import jieRobotTutor from "@/assets/images/jie-robot-tutor.png";
import studentLearning from "@/assets/images/student-learning.png";
import classroomAi from "@/assets/images/classroom-ai.png";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";

const STATS = [
  { value: "25+", label: "Languages" },
  { value: "K–College", label: "Grade Levels" },
  { value: "Voice-First", label: "Learning" },
  { value: "24/7", label: "Available" },
];

const SUBJECTS = [
  "Math", "Science", "History", "English", "Biology",
  "Chemistry", "Physics", "Geography", "Economics", "Coding"
];

export function TutorHeroBanner() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [tick, setTick] = useState(0);

  const slides = [
    {
      image: jieRobotTutor,
      headline: "Your Personal AI Tutor",
      sub: "Powered by advanced voice conversation technology",
      accent: "#C0003C",
    },
    {
      image: studentLearning,
      headline: "Learn at Your Own Pace",
      sub: "Adaptive instruction across every grade level and subject",
      accent: "#1a1a2e",
    },
    {
      image: classroomAi,
      headline: "AI That Understands You",
      sub: "Real-time voice conversation with longitudinal memory",
      accent: "#0a3d62",
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((p) => p + 1), 80);
    return () => clearInterval(t);
  }, []);

  const subjectIndex = Math.floor(tick / 30) % SUBJECTS.length;

  return (
    <div className="w-full rounded-2xl overflow-hidden mb-2" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      
      {/* ── Hero Slideshow Banner ───────────────────────────── */}
      <div
        className="relative w-full overflow-hidden"
        style={{ height: "180px", borderRadius: "16px 16px 0 0" }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-all duration-1000"
            style={{
              opacity: activeSlide === i ? 1 : 0,
              transform: activeSlide === i ? "scale(1)" : "scale(1.03)",
            }}
          >
            {/* Photo */}
            <img
              src={slide.image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            {/* Gradient overlay */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(105deg, ${slide.accent}ee 0%, ${slide.accent}99 35%, transparent 65%)`,
              }}
            />
            {/* Text block */}
            <div className="absolute inset-0 flex flex-col justify-center pl-6 pr-40">
              <div
                className="inline-flex items-center gap-2 mb-2 px-2 py-0.5 rounded-full w-fit"
                style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(6px)" }}
              >
                <img src={jieLogo} alt="" className="h-4 w-4 rounded-sm object-cover" />
                <span className="text-white text-xs font-semibold tracking-widest uppercase">JIE Mastery</span>
              </div>
              <h2
                className="text-white font-black leading-tight mb-1"
                style={{ fontSize: "1.35rem", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
              >
                {slide.headline}
              </h2>
              <p
                className="text-white/85 text-sm font-medium"
                style={{ textShadow: "0 1px 6px rgba(0,0,0,0.3)" }}
              >
                {slide.sub}
              </p>
            </div>
          </div>
        ))}

        {/* Slide dots */}
        <div className="absolute bottom-3 right-4 flex gap-1.5 z-10">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveSlide(i)}
              className="transition-all duration-300"
              style={{
                width: activeSlide === i ? "20px" : "6px",
                height: "6px",
                borderRadius: "3px",
                background: activeSlide === i ? "white" : "rgba(255,255,255,0.45)",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Stats Strip ───────────────────────────────────────── */}
      <div
        className="grid grid-cols-4 w-full"
        style={{
          background: "linear-gradient(90deg, #C0003C 0%, #8B001F 100%)",
        }}
      >
        {STATS.map((stat, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center py-2.5"
            style={{
              borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.2)" : "none",
            }}
          >
            <span
              className="text-white font-black leading-none"
              style={{ fontSize: "1.05rem" }}
            >
              {stat.value}
            </span>
            <span className="text-white/75 text-xs mt-0.5 font-medium tracking-wide">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Subject Ticker Strip ──────────────────────────────── */}
      <div
        className="flex items-center gap-0 w-full overflow-hidden"
        style={{
          background: "#1a1a2e",
          borderRadius: "0 0 16px 16px",
          padding: "7px 16px",
        }}
      >
        <span
          className="text-xs font-bold uppercase tracking-widest mr-3 shrink-0"
          style={{ color: "#C0003C" }}
        >
          Subjects
        </span>
        <div className="flex gap-2 overflow-hidden flex-1">
          {SUBJECTS.map((subj, i) => {
            const isActive = i === subjectIndex;
            const isNear = Math.abs(i - subjectIndex) <= 2;
            return (
              <span
                key={subj}
                className="text-xs font-semibold whitespace-nowrap transition-all duration-500 px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: isActive ? "#C0003C" : isNear ? "rgba(192,0,60,0.15)" : "transparent",
                  color: isActive ? "white" : isNear ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)",
                  transform: isActive ? "scale(1.1)" : "scale(1)",
                }}
              >
                {subj}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
