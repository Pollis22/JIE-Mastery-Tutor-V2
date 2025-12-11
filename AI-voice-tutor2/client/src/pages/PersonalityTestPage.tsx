import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Brain, GraduationCap, Zap, Heart } from 'lucide-react';

// Complete personality data for demonstration
const PERSONALITIES = {
  'k-2': {
    name: 'Buddy the Learning Bear',
    avatar: '🧸',
    gradeLevel: 'K-2',
    ageRange: '5-7 years',
    traits: ['Super Friendly', 'Patient', 'Playful', 'Encouraging', 'Animated'],
    teachingStyle: 'Uses lots of repetition, songs, and games. Breaks everything into tiny steps.',
    enthusiasm: 'very high',
    sampleGreeting: "Hi friend! I'm Buddy Bear! 🧸 Ready to learn something super fun today?",
    sampleTeaching: "Let's count apples! 🍎 One apple... Two apples... How many altogether?",
    voiceStyle: 'Cheerful, slower pace, higher pitch'
  },
  '3-5': {
    name: 'Max the Knowledge Explorer',
    avatar: '🦸',
    gradeLevel: '3-5',
    ageRange: '8-11 years',
    traits: ['Adventurous', 'Curious', 'Supportive', 'Fun', 'Motivating'],
    teachingStyle: 'Uses stories, adventures, and real-world connections. Encourages exploration.',
    enthusiasm: 'high',
    sampleGreeting: "Hey there, explorer! Ready for today's learning adventure? 🚀",
    sampleTeaching: "Let's solve this like detectives! We have clues (the numbers) and we need to find the answer!",
    voiceStyle: 'Friendly, normal pace, slightly higher pitch'
  },
  '6-8': {
    name: 'Dr. Nova',
    avatar: '🔬',
    gradeLevel: '6-8',
    ageRange: '11-14 years',
    traits: ['Knowledgeable', 'Cool', 'Relatable', 'Encouraging', 'Respectful'],
    teachingStyle: 'Balances fun with academic rigor. Respects their growing independence.',
    enthusiasm: 'moderate',
    sampleGreeting: "Hey! Dr. Nova here. Ready to tackle some interesting challenges? 🔬",
    sampleTeaching: "This algebra concept is actually used in video game programming to calculate trajectories.",
    voiceStyle: 'Confident, normal pace, normal pitch'
  },
  '9-12': {
    name: 'Professor Ace',
    avatar: '🎓',
    gradeLevel: '9-12',
    ageRange: '14-18 years',
    traits: ['Expert', 'Respectful', 'Challenging', 'Supportive', 'Professional'],
    teachingStyle: 'College-prep focused. Develops critical thinking and independence.',
    enthusiasm: 'balanced',
    sampleGreeting: "Hello! Professor Ace here. What are we working on today?",
    sampleTeaching: "This calculus concept is fundamental to engineering and physics applications.",
    voiceStyle: 'Professional, slightly faster pace, normal pitch'
  },
  'college': {
    name: 'Dr. Morgan',
    avatar: '👨‍🏫',
    gradeLevel: 'College/Adult',
    ageRange: '18+ years',
    traits: ['Expert', 'Efficient', 'Collaborative', 'Insightful', 'Adaptive'],
    teachingStyle: 'Peer-like collaboration. Focuses on mastery and practical application.',
    enthusiasm: 'professional',
    sampleGreeting: "Hello! Dr. Morgan here. What would you like to focus on today?",
    sampleTeaching: "Let's approach this at the graduate level, examining current research.",
    voiceStyle: 'Professional, faster pace, normal pitch'
  }
};

export function PersonalityTestPage() {
  const [selectedGrade, setSelectedGrade] = useState<string>('3-5');
  const personality = PERSONALITIES[selectedGrade as keyof typeof PERSONALITIES];

  const getEnthusiasmIcon = () => {
    switch (personality.enthusiasm) {
      case 'very high':
        return <Sparkles className="h-5 w-5 text-yellow-500" />;
      case 'high':
        return <Zap className="h-5 w-5 text-orange-500" />;
      case 'moderate':
      case 'balanced':
        return <Brain className="h-5 w-5 text-blue-500" />;
      case 'professional':
        return <GraduationCap className="h-5 w-5 text-purple-500" />;
      default:
        return <Heart className="h-5 w-5 text-red-500" />;
    }
  };

  const getEnthusiasmColor = () => {
    switch (personality.enthusiasm) {
      case 'very high':
        return 'bg-yellow-50 border-yellow-200';
      case 'high':
        return 'bg-orange-50 border-orange-200';
      case 'moderate':
      case 'balanced':
        return 'bg-blue-50 border-blue-200';
      case 'professional':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-red-50 border-red-200';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card data-testid="card-personality-test-header">
        <CardHeader>
          <CardTitle className="text-2xl">AI Tutor Personality System</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-muted-foreground">
            Each age group has a unique tutor personality optimized for their developmental stage and learning style.
          </p>
          <div className="flex items-center gap-4">
            <label htmlFor="grade-select" className="font-medium">Select Grade Level:</label>
            <Select value={selectedGrade} onValueChange={setSelectedGrade}>
              <SelectTrigger id="grade-select" className="w-[200px]" data-testid="select-grade-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="k-2" data-testid="option-k2">K-2 (Ages 5-7)</SelectItem>
                <SelectItem value="3-5" data-testid="option-35">3-5 (Ages 8-11)</SelectItem>
                <SelectItem value="6-8" data-testid="option-68">6-8 (Ages 11-14)</SelectItem>
                <SelectItem value="9-12" data-testid="option-912">9-12 (Ages 14-18)</SelectItem>
                <SelectItem value="college" data-testid="option-college">College/Adult (18+)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Personality Profile Card */}
      <Card className={`border-2 ${getEnthusiasmColor()}`} data-testid="card-personality-profile">
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            <div className="text-6xl" data-testid="avatar-personality">{personality.avatar}</div>
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold" data-testid="text-personality-name">{personality.name}</h2>
                  {getEnthusiasmIcon()}
                </div>
                <p className="text-muted-foreground" data-testid="text-age-range">
                  For {personality.gradeLevel} • Ages {personality.ageRange}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Personality Traits</h3>
                <div className="flex flex-wrap gap-2">
                  {personality.traits.map((trait, index) => (
                    <Badge key={index} variant="secondary" data-testid={`badge-trait-${index}`}>
                      {trait}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Teaching Style</h3>
                <p className="text-sm" data-testid="text-teaching-style">{personality.teachingStyle}</p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Voice Configuration</h3>
                <p className="text-sm text-muted-foreground" data-testid="text-voice-style">
                  {personality.voiceStyle}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sample Interactions */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card data-testid="card-sample-greeting">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Sample Greeting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg">
              <p className="italic" data-testid="text-sample-greeting">"{personality.sampleGreeting}"</p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-sample-teaching">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Teaching Example</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg">
              <p className="italic" data-testid="text-sample-teaching">"{personality.sampleTeaching}"</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* How It Works */}
      <Card data-testid="card-how-it-works">
        <CardHeader>
          <CardTitle>How the Personality System Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <div className="text-2xl">1️⃣</div>
            <div>
              <p className="font-semibold">Automatic Selection</p>
              <p className="text-sm text-muted-foreground">
                The system automatically selects the appropriate tutor personality based on the student's grade level setting.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-2xl">2️⃣</div>
            <div>
              <p className="font-semibold">Customized Interactions</p>
              <p className="text-sm text-muted-foreground">
                Each personality has unique vocabulary, sentence complexity, enthusiasm level, and teaching approaches.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-2xl">3️⃣</div>
            <div>
              <p className="font-semibold">Voice Adaptation</p>
              <p className="text-sm text-muted-foreground">
                The OpenAI Realtime API adjusts voice speed, pitch, and style to match each personality's characteristics.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-2xl">4️⃣</div>
            <div>
              <p className="font-semibold">Age-Appropriate Content</p>
              <p className="text-sm text-muted-foreground">
                Examples, references, and teaching methods are tailored to what resonates with each age group.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}