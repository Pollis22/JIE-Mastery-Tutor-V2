import { AIOrb, OrbState } from './AIOrb';

interface RobotAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  ageGroup: '6-8' | '9-12' | 'College';
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP = { sm: 72, md: 100, lg: 140 };

export function RobotAvatar({ isSpeaking, isListening, ageGroup, size = 'md' }: RobotAvatarProps) {
  const orbState: OrbState = isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle';
  return (
    <AIOrb
      state={orbState}
      size={SIZE_MAP[size]}
      ageGroup={ageGroup}
    />
  );
}
