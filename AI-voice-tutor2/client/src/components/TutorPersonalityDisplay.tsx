import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Heart, Zap, Brain, GraduationCap } from 'lucide-react';

interface TutorPersonality {
  name: string;
  avatar: string;
  gradeLevel: string;
  traits: string[];
  enthusiasm: string;
}

// Map grade levels to personality data
const PERSONALITIES: Record<string, TutorPersonality> = {
  'k-2': {
    name: 'Buddy the Learning Bear',
    avatar: '🧸',
    gradeLevel: 'K-2',
    traits: ['Super Friendly', 'Patient', 'Playful'],
    enthusiasm: 'very high'
  },
  '3-5': {
    name: 'Max the Knowledge Explorer',
    avatar: '🦸',
    gradeLevel: 'Grades 3-5',
    traits: ['Adventurous', 'Curious', 'Supportive'],
    enthusiasm: 'high'
  },
  '6-8': {
    name: 'Dr. Nova',
    avatar: '🔬',
    gradeLevel: 'Grades 6-8',
    traits: ['Knowledgeable', 'Cool', 'Relatable'],
    enthusiasm: 'moderate'
  },
  '9-12': {
    name: 'Professor Ace',
    avatar: '🎓',
    gradeLevel: 'Grades 9-12',
    traits: ['Expert', 'Respectful', 'Professional'],
    enthusiasm: 'balanced'
  },
  'college': {
    name: 'Dr. Morgan',
    avatar: '👨‍🏫',
    gradeLevel: 'College/Adult',
    traits: ['Expert', 'Efficient', 'Collaborative'],
    enthusiasm: 'professional'
  }
};

export function TutorPersonalityDisplay() {
  // Fetch current user to get their grade level
  const { data: user } = useQuery({
    queryKey: ['/api/auth/me'],
  });

  if (!user || !user.gradeLevel) {
    return null;
  }

  // Normalize grade level to match personality keys
  const normalizedGrade = user.gradeLevel.toLowerCase().replace(/[^a-z0-9]/g, '');
  let personalityKey = 'college'; // default

  if (normalizedGrade.includes('k') || normalizedGrade === '1' || normalizedGrade === '2') {
    personalityKey = 'k-2';
  } else if (['3', '4', '5'].includes(normalizedGrade) || normalizedGrade === '35') {
    personalityKey = '3-5';
  } else if (['6', '7', '8'].includes(normalizedGrade) || normalizedGrade === '68') {
    personalityKey = '6-8';
  } else if (['9', '10', '11', '12'].includes(normalizedGrade) || normalizedGrade === '912') {
    personalityKey = '9-12';
  }

  const personality = PERSONALITIES[personalityKey];

  if (!personality) {
    return null;
  }

  const getEnthusiasmIcon = () => {
    switch (personality.enthusiasm) {
      case 'very high':
        return <Sparkles className="h-4 w-4 text-yellow-500" />;
      case 'high':
        return <Zap className="h-4 w-4 text-orange-500" />;
      case 'moderate':
      case 'balanced':
        return <Brain className="h-4 w-4 text-blue-500" />;
      case 'professional':
        return <GraduationCap className="h-4 w-4 text-purple-500" />;
      default:
        return <Heart className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <Card className="mb-4" data-testid="card-tutor-personality">
      <CardContent className="pt-6">
        <div className="flex items-start space-x-4">
          <div className="text-4xl" data-testid="avatar-tutor">
            {personality.avatar}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg" data-testid="text-tutor-name">
                {personality.name}
              </h3>
              {getEnthusiasmIcon()}
            </div>
            <p className="text-sm text-muted-foreground mb-2" data-testid="text-grade-level">
              Your AI Tutor for {personality.gradeLevel}
            </p>
            <div className="flex flex-wrap gap-1">
              {personality.traits.map((trait, index) => (
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className="text-xs"
                  data-testid={`badge-trait-${index}`}
                >
                  {trait}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Mini version for header/navbar
export function TutorPersonalityBadge() {
  const { data: user } = useQuery({
    queryKey: ['/api/auth/me'],
  });

  if (!user || !user.gradeLevel) {
    return null;
  }

  // Same normalization logic
  const normalizedGrade = user.gradeLevel.toLowerCase().replace(/[^a-z0-9]/g, '');
  let personalityKey = 'college';

  if (normalizedGrade.includes('k') || normalizedGrade === '1' || normalizedGrade === '2') {
    personalityKey = 'k-2';
  } else if (['3', '4', '5'].includes(normalizedGrade) || normalizedGrade === '35') {
    personalityKey = '3-5';
  } else if (['6', '7', '8'].includes(normalizedGrade) || normalizedGrade === '68') {
    personalityKey = '6-8';
  } else if (['9', '10', '11', '12'].includes(normalizedGrade) || normalizedGrade === '912') {
    personalityKey = '9-12';
  }

  const personality = PERSONALITIES[personalityKey];

  if (!personality) {
    return null;
  }

  return (
    <Badge variant="outline" className="gap-1" data-testid="badge-tutor-personality">
      <span className="text-lg">{personality.avatar}</span>
      <span className="text-xs">{personality.name.split(' ')[0]}</span>
    </Badge>
  );
}