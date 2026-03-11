import { useState, useEffect } from "react";
import parentHighfive from "@/assets/images/parent-highfive.png";
import motherSonStudy from "@/assets/images/mother-son-study.png";
import libraryStudent from "@/assets/images/library-student.png";
import jieRobotTutor from "@/assets/images/jie-robot-tutor.png";
import jieLogo from "@/assets/jie-mastery-logo-sm.jpg";

const TIPS = [
  { icon: "🎯", text: "Speak clearly and take your time — your tutor is listening carefully." },
  { icon: "📚", text: "Ask 'Can you explain that differently?' anytime you need a new approach." },
  { icon: "💡", text: "The best learners ask questions. There are no wrong ones here." },
  { icon: "🔁", text: "Say 'Can we review that?' to revisit anything you want to master." },
  { icon: "🧠", text: "Your tutor remembers past sessions and builds on what you know." },
  { icon: "✏️", text: "Take notes while you listen — writing helps lock in learning." },
  { icon: "🌍", text: "JIE supports 25+ languages. Say 'Speak in Spanish' anytime." },
  { icon: "⏸️", text: "Need a moment? Just pause — your tutor will wait for you." },
];

const GALLERY = [
  { src: parentHighfive, caption: "Real results, real families" },
  { src: libraryStudent, caption: "From dorms to dining rooms" },
  { src: motherSonStudy, caption: "Learning together, anytime" },
  { src: jieRobotTutor, caption: "Powered by advanced AI" },
];

interface Props {
  isSpeaking?: boolean;
  isConnected?: boolean;
  hasMessages?: boolean;
}

export function TutorSessionAmbient({ isSpeaking = false, isConnected = false, hasMessages = false }: Props) {
  const [tipIndex, setTipIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [pulseRing, setPulseRing] = useState(false);
  const [visible, setVisible] = useState(true);

  // Hide once conversation is flowing
  if (hasMessages) return null;

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setTipIndex(i => (i + 1) % TIPS.length);
        setVisible(true);
      }, 400);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setGalleryIndex(i => (i + 1) % GALLERY.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (isSpeaking) {
      setPulseRing(true);
      const t = setTimeout(() => setPulseRing(false), 1200);
      return () => clearTimeout(t);
    }
  }, [isSpeaking]);

  const tip = TIPS[tipIndex];
  const photo = GALLERY[galleryIndex];

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-4 py-6 px-4"
      style={{
        background: "linear-gradient(160deg, #f8f9ff 0%, #eef1ff 40%, #fdf0f3 100%)",
        minHeight: "280px",
      }}
    >
      {/* Orb + speaking indicator */}
      <div className="relative flex items-center justify-center" style={{ width: 90, height: 90 }}>
        {/* Outer pulse ring */}
        {(isSpeaking || isConnected) && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(192,0,60,0.15) 0%, transparent 70%)",
              animation: isSpeaking ? "ping 1s cubic-bezier(0,0,0.2,1) infinite" : "none",
              transform: "scale(1.4)",
            }}
          />
        )}
        {/* Logo orb */}
        <div
          className="relative z-10 rounded-full flex items-center justify-center overflow-hidden shadow-xl"
          style={{
            width: 72,
            height: 72,
            background: "linear-gradient(135deg, #C0003C, #8B001F)",
            boxShadow: isSpeaking
              ? "0 0 0 4px rgba(192,0,60,0.3), 0 8px 32px rgba(192,0,60,0.4)"
              : "0 4px 20px rgba(192,0,60,0.25)",
            transition: "box-shadow 0.4s ease",
          }}
        >
          <img src={jieLogo} alt="JIE" className="w-12 h-12 rounded-full object-cover" />
        </div>
        {/* Speaking bars */}
        {isSpeaking && (
          <div className="absolute -bottom-3 flex gap-0.5 items-end justify-center">
            {[1,2,3,4,5].map(i => (
              <div
                key={i}
                style={{
                  width: 3,
                  borderRadius: 2,
                  background: "#C0003C",
                  animation: `soundBar${i} 0.6s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.1}s`,
                  height: `${8 + Math.random() * 12}px`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status label */}
      <div
        className="text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full"
        style={{
          background: isConnected ? "rgba(192,0,60,0.1)" : "rgba(100,100,120,0.08)",
          color: isConnected ? "#C0003C" : "#888",
          border: `1px solid ${isConnected ? "rgba(192,0,60,0.2)" : "rgba(100,100,120,0.15)"}`,
        }}
      >
        {isSpeaking ? "🔊 JIE is speaking..." : isConnected ? "✓ Connected — start speaking" : "Connecting..."}
      </div>

      {/* Photo gallery card — only show once connected, prevents flash before session starts */}
      {isConnected && (
      <div
        className="w-full rounded-xl overflow-hidden relative"
        style={{ height: 110, maxWidth: 340, opacity: 1, transition: "opacity 0.5s ease" }}
      >
        {GALLERY.map((g, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-all duration-700"
            style={{ opacity: galleryIndex === i ? 1 : 0 }}
          >
            <img src={g.src} alt="" className="w-full h-full object-cover object-center" />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(26,10,20,0.7) 0%, transparent 55%)" }}
            />
            <span
              className="absolute bottom-2 left-3 text-white text-xs font-semibold"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
            >
              {g.caption}
            </span>
          </div>
        ))}
      </div>
      )}

      {/* Rotating tip */}
      <div
        className="w-full rounded-xl p-3 flex items-start gap-3 transition-all duration-400"
        style={{
          maxWidth: 340,
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(192,0,60,0.12)",
          boxShadow: "0 2px 12px rgba(192,0,60,0.06)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}
      >
        <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>{tip.icon}</span>
        <p className="text-xs leading-relaxed" style={{ color: "#444", margin: 0 }}>
          {tip.text}
        </p>
      </div>

      <style>{`
        @keyframes soundBar1 { from { height: 4px } to { height: 14px } }
        @keyframes soundBar2 { from { height: 8px } to { height: 20px } }
        @keyframes soundBar3 { from { height: 6px } to { height: 18px } }
        @keyframes soundBar4 { from { height: 10px } to { height: 16px } }
        @keyframes soundBar5 { from { height: 4px } to { height: 12px } }
        @keyframes ping { 75%, 100% { transform: scale(1.8); opacity: 0; } }
      `}</style>
    </div>
  );
}
