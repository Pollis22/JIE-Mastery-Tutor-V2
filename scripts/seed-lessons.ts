import { db } from "../server/db";
import { practiceLessons } from "../shared/schema";

interface LessonData {
  grade: string;
  subject: string;
  topic: string;
  lessonTitle: string;
  learningGoal: string;
  tutorIntroduction: string;
  guidedQuestions: string[];
  practicePrompts: string[];
  checkUnderstanding: string;
  encouragementClose: string;
  difficultyLevel: number;
  estimatedMinutes: number;
  orderIndex: number;
}

const kindergartenMathLessons: LessonData[] = [
  {
    grade: 'K', subject: 'Math', topic: 'Counting',
    lessonTitle: 'Counting to 5',
    learningGoal: 'Students will count objects from 1 to 5 and recognize these numbers.',
    tutorIntroduction: 'Hi there. Today we are going to practice counting to 5. Counting helps us know how many things we have. Are you ready?',
    guidedQuestions: [
      'Can you count from 1 to 5 for me? Let me hear you.',
      'If I show you 3 blocks, can you count them one at a time?',
      'What number comes after 3? How do you know?',
      'If we have 4 apples and take away 1, let\'s count what\'s left together.',
      'Can you show me 5 fingers? Let\'s count them.'
    ],
    practicePrompts: ['Count from 1 to 5 out loud.', 'Count these toys in your room.', 'Tell me what number comes after 4.'],
    checkUnderstanding: 'Can you tell me your favorite number from 1 to 5? Why do you like it?',
    encouragementClose: 'You did a great job counting today. Keep practicing and you will get even better.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 1
  },
  {
    grade: 'K', subject: 'Math', topic: 'Counting',
    lessonTitle: 'Counting to 10',
    learningGoal: 'Students will count objects from 1 to 10 and understand number sequence.',
    tutorIntroduction: 'Hello. Today we are going to count all the way to 10. That\'s more than 5. Let\'s see if you can do it.',
    guidedQuestions: [
      'Can you count from 1 to 10 for me? Take your time.',
      'What number comes after 7? Let\'s count together to check.',
      'If I have 6 crayons and get 2 more, how many will I have? Let\'s count.',
      'Can you find 10 things in your room? Let\'s count them.',
      'Which is more, 8 or 5? How can you tell?'
    ],
    practicePrompts: ['Count from 1 to 10 out loud.', 'Count your fingers and toes.', 'Tell me what number comes before 9.'],
    checkUnderstanding: 'What is the biggest number you counted today?',
    encouragementClose: 'Excellent counting. You are really good at this.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 2
  },
  {
    grade: 'K', subject: 'Math', topic: 'Number Recognition',
    lessonTitle: 'Recognizing Numbers 1-5',
    learningGoal: 'Students will identify and name written numbers from 1 to 5.',
    tutorIntroduction: 'Hi. Today we will look at numbers and learn what they look like. Numbers have special shapes. Let\'s find them.',
    guidedQuestions: [
      'Can you tell me what this number is? It looks like a straight line.',
      'When you see the number 3, what does it remind you of?',
      'How is the number 2 different from the number 5?',
      'If I show you the number 4, how many fingers would you hold up?',
      'Can you find any numbers around your house? What numbers do you see?'
    ],
    practicePrompts: ['Point to the number 3.', 'Draw the number 5 with your finger in the air.', 'Tell me what number this is when I show it to you.'],
    checkUnderstanding: 'Which number is easiest for you to remember?',
    encouragementClose: 'You are learning your numbers so well. Great work.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 3
  },
  {
    grade: 'K', subject: 'Math', topic: 'Number Recognition',
    lessonTitle: 'Recognizing Numbers 6-10',
    learningGoal: 'Students will identify and name written numbers from 6 to 10.',
    tutorIntroduction: 'Hello there. Today we will learn the bigger numbers from 6 to 10. These are important numbers. Let\'s look at them together.',
    guidedQuestions: [
      'Can you tell me what number this is? It looks like a number 9 upside down.',
      'How is the number 8 different from the number 6?',
      'When you see 10, how many fingers do you need? Let\'s check.',
      'If I write the number 7, can you draw it in the air?',
      'Which number from 6 to 10 do you like best?'
    ],
    practicePrompts: ['Point to the number 8.', 'Tell me what number comes between 6 and 8.', 'Draw the number 10.'],
    checkUnderstanding: 'Can you remember all the numbers from 1 to 10 now?',
    encouragementClose: 'You did wonderful learning these numbers. I am proud of you.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 4
  },
  {
    grade: 'K', subject: 'Math', topic: 'Shapes',
    lessonTitle: 'Circle Shape',
    learningGoal: 'Students will identify circles and understand their properties.',
    tutorIntroduction: 'Hi. Today we are going to learn about circles. A circle is round like a ball. Let\'s find some circles together.',
    guidedQuestions: [
      'Can you find something round in your room? What is it?',
      'Does a circle have any corners? Let\'s check.',
      'If I roll a ball, why does it roll? What shape is it?',
      'Can you draw a circle in the air with your finger?',
      'What things do you see every day that are circles?'
    ],
    practicePrompts: ['Find a circle in your house.', 'Draw a circle on paper.', 'Tell me why a circle is different from other shapes.'],
    checkUnderstanding: 'Can you name three things that are circles?',
    encouragementClose: 'Great job finding circles. You have a good eye for shapes.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 5
  },
  {
    grade: 'K', subject: 'Math', topic: 'Shapes',
    lessonTitle: 'Square Shape',
    learningGoal: 'Students will identify squares and understand they have four equal sides.',
    tutorIntroduction: 'Hello. Today we will talk about squares. A square has four sides that are all the same. Let\'s explore squares.',
    guidedQuestions: [
      'Can you count the sides of a square? How many are there?',
      'Are all the sides the same length? Let\'s check.',
      'How many corners does a square have?',
      'Can you find a square in your room? What is it?',
      'How is a square different from a circle?'
    ],
    practicePrompts: ['Draw a square.', 'Find something square in your house.', 'Count the corners of a square.'],
    checkUnderstanding: 'What makes a square special?',
    encouragementClose: 'You understand squares so well. Excellent thinking.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 6
  },
  {
    grade: 'K', subject: 'Math', topic: 'Shapes',
    lessonTitle: 'Triangle Shape',
    learningGoal: 'Students will identify triangles and understand they have three sides.',
    tutorIntroduction: 'Hi there. Today we will learn about triangles. A triangle has three sides and three corners. Let\'s find some.',
    guidedQuestions: [
      'How many sides does a triangle have? Let\'s count them.',
      'Can you draw a triangle in the air?',
      'What letter looks a bit like a triangle?',
      'If a shape has 4 sides, is it a triangle? Why not?',
      'Can you make a triangle with your fingers?'
    ],
    practicePrompts: ['Draw a triangle.', 'Count the corners on a triangle.', 'Find something shaped like a triangle.'],
    checkUnderstanding: 'How is a triangle different from a square?',
    encouragementClose: 'Great work learning about triangles. You are doing amazing.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 7
  },
  {
    grade: 'K', subject: 'Math', topic: 'Shapes',
    lessonTitle: 'Rectangle Shape',
    learningGoal: 'Students will identify rectangles and understand they have four sides with two pairs of equal sides.',
    tutorIntroduction: 'Hello. Today we will learn about rectangles. A rectangle looks like a longer square. Let\'s see what makes it special.',
    guidedQuestions: [
      'How many sides does a rectangle have?',
      'Are all the sides the same length on a rectangle?',
      'Can you find a book? What shape is it?',
      'How is a rectangle like a square? How is it different?',
      'Can you draw a rectangle that is long and skinny?'
    ],
    practicePrompts: ['Find a rectangle in your room.', 'Draw a rectangle.', 'Tell me how many corners a rectangle has.'],
    checkUnderstanding: 'Can you name something in your house that is a rectangle?',
    encouragementClose: 'You really understand rectangles. Well done.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 8
  },
  {
    grade: 'K', subject: 'Math', topic: 'Shapes',
    lessonTitle: 'Comparing Shapes',
    learningGoal: 'Students will compare and contrast circles, squares, triangles, and rectangles.',
    tutorIntroduction: 'Hi. Today we will look at all the shapes we learned and see how they are different. This will be fun.',
    guidedQuestions: [
      'Which shape has no corners at all?',
      'Which shapes have 4 sides? Can you name them?',
      'If I want a shape with 3 corners, which one do I need?',
      'How is a square different from a rectangle?',
      'Which shape can roll? Why can it roll?'
    ],
    practicePrompts: ['Sort your toys by shape.', 'Draw one of each shape.', 'Tell me which shape you see most in your room.'],
    checkUnderstanding: 'What is your favorite shape and why?',
    encouragementClose: 'You know so much about shapes. I am impressed.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 9
  },
  {
    grade: 'K', subject: 'Math', topic: 'Patterns',
    lessonTitle: 'Patterns with Shapes',
    learningGoal: 'Students will create and identify simple patterns using shapes.',
    tutorIntroduction: 'Hello there. Today we will make patterns with shapes. A pattern is when shapes repeat in order. Let\'s try it.',
    guidedQuestions: [
      'If I put circle, square, circle, square, what comes next?',
      'Can you make your own pattern with two shapes?',
      'What pattern do you see here: triangle, circle, triangle, circle?',
      'If a pattern goes red circle, blue square, red circle, what comes next?',
      'Why do we call it a pattern?'
    ],
    practicePrompts: ['Make a pattern with shapes you draw.', 'Tell me what comes next in this pattern.', 'Create a pattern using things in your room.'],
    checkUnderstanding: 'Can you explain what a pattern is?',
    encouragementClose: 'You are great at making patterns. Keep it up.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 10
  },
  {
    grade: 'K', subject: 'Math', topic: 'Addition',
    lessonTitle: 'Adding Within 5 - Part 1',
    learningGoal: 'Students will add two small numbers that total 5 or less.',
    tutorIntroduction: 'Hi. Today we will learn about adding. Adding means putting things together to see how many we have. Let\'s start.',
    guidedQuestions: [
      'If you have 2 blocks and I give you 1 more, how many do you have?',
      'Can you show me with your fingers? Hold up 2, now add 1 more.',
      'What happens when we put 1 apple and 2 apples together?',
      'If you eat 1 cookie and then 1 more cookie, how many did you eat?',
      'Can you think of other things you could add together?'
    ],
    practicePrompts: ['Use your fingers to show 2 plus 1.', 'Draw 3 stars and 1 more star. Count them all.', 'Tell me what 1 plus 3 equals.'],
    checkUnderstanding: 'What does it mean to add?',
    encouragementClose: 'You are learning to add. This is wonderful.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 11
  },
  {
    grade: 'K', subject: 'Math', topic: 'Addition',
    lessonTitle: 'Adding Within 5 - Part 2',
    learningGoal: 'Students will practice more addition combinations within 5.',
    tutorIntroduction: 'Hello. Today we will practice more adding. You are getting better at this. Let\'s keep going.',
    guidedQuestions: [
      'If you have 3 toys and find 2 more, how many toys do you have now?',
      'Can you count them all together?',
      'What is 2 plus 2? Use your fingers to check.',
      'If there are 4 birds and 1 more flies over, how many birds are there?',
      'Which is bigger, 3 plus 1 or 2 plus 2? Let\'s figure it out.'
    ],
    practicePrompts: ['Add 3 plus 2 using objects.', 'Tell me what 4 plus 1 equals.', 'Draw a picture to show 2 plus 3.'],
    checkUnderstanding: 'What is your favorite addition problem?',
    encouragementClose: 'Great job adding. You are getting really good.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 12
  },
  {
    grade: 'K', subject: 'Math', topic: 'Subtraction',
    lessonTitle: 'Subtracting Within 5 - Part 1',
    learningGoal: 'Students will understand subtraction as taking away from a group.',
    tutorIntroduction: 'Hi there. Today we will learn about taking away. When we take away, we have less than before. Let\'s try it.',
    guidedQuestions: [
      'If you have 3 cookies and eat 1, how many are left?',
      'Can you show me with your fingers? Hold up 3, now put 1 down.',
      'What happens when we start with 4 blocks and take away 2?',
      'If there are 5 birds and 1 flies away, how many stay?',
      'Is taking away the same as adding? How is it different?'
    ],
    practicePrompts: ['Show 5 fingers, then put down 2. How many are left?', 'Take away 1 toy from a group of 3. Count what remains.', 'Tell me what 4 take away 1 equals.'],
    checkUnderstanding: 'What does taking away mean?',
    encouragementClose: 'You understand taking away. Well done.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 13
  },
  {
    grade: 'K', subject: 'Math', topic: 'Subtraction',
    lessonTitle: 'Subtracting Within 5 - Part 2',
    learningGoal: 'Students will practice more subtraction within 5.',
    tutorIntroduction: 'Hello. Today we will practice more taking away. You are doing great. Let\'s keep learning.',
    guidedQuestions: [
      'If you have 5 candies and give away 3, how many do you keep?',
      'Can we count what\'s left together?',
      'What is 4 take away 2? Use your fingers.',
      'If 5 children are playing and 2 go home, how many children are still playing?',
      'Which is less, 5 take away 1 or 5 take away 3?'
    ],
    practicePrompts: ['Take away 2 from a group of 5 objects.', 'Tell me what 3 take away 1 equals.', 'Draw 4 things and cross out 2. How many are left?'],
    checkUnderstanding: 'Can you make up your own take away problem?',
    encouragementClose: 'Excellent work with taking away. You are learning fast.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 14
  },
  {
    grade: 'K', subject: 'Math', topic: 'Comparing Numbers',
    lessonTitle: 'Comparing More and Less',
    learningGoal: 'Students will compare groups and use the words more, less, and same.',
    tutorIntroduction: 'Hi. Today we will compare groups to see which has more or less. This helps us understand numbers. Let\'s try.',
    guidedQuestions: [
      'If I have 5 apples and you have 3, who has more?',
      'How can you tell which group has more?',
      'If we both have 4 crayons, is that the same?',
      'What does less mean? Can you show me?',
      'Is 7 more than 4 or less than 4?'
    ],
    practicePrompts: ['Make two groups of toys. Which has more?', 'Tell me if 6 is more or less than 3.', 'Show me two groups that are the same.'],
    checkUnderstanding: 'How do you know when one group has more than another?',
    encouragementClose: 'You are really good at comparing. Great thinking.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 15
  },
  {
    grade: 'K', subject: 'Math', topic: 'Counting',
    lessonTitle: 'Counting Backwards from 10',
    learningGoal: 'Students will count backwards from 10 to 1.',
    tutorIntroduction: 'Hello there. Today we will count backwards. That means we start at 10 and go down to 1. Let\'s try together.',
    guidedQuestions: [
      'Can you count from 10 down to 1? Let\'s do it slowly.',
      'What number comes before 7 when we count backwards?',
      'If we start at 5 and count backwards, what numbers do we say?',
      'Why do you think counting backwards is useful?',
      'Can you count backwards from 10 to 5?'
    ],
    practicePrompts: ['Count backwards from 10 to 1 out loud.', 'Tell me what comes before 4 when counting backwards.', 'Start at 8 and count backwards to 3.'],
    checkUnderstanding: 'Is counting backwards harder than counting forwards? Why?',
    encouragementClose: 'You did great counting backwards. Keep practicing.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 16
  },
  {
    grade: 'K', subject: 'Math', topic: 'Skip Counting',
    lessonTitle: 'Skip Counting by 2s to 10',
    learningGoal: 'Students will skip count by 2s from 2 to 10.',
    tutorIntroduction: 'Hi. Today we will learn skip counting. That means we jump over some numbers. We will count 2, 4, 6, 8, 10. Let\'s try.',
    guidedQuestions: [
      'Can you say 2, 4, 6, 8, 10 with me?',
      'What number did we skip after 2?',
      'If you count by 2s, what comes after 6?',
      'Can you show me pairs of things? Like 2 shoes, then 2 more shoes?',
      'Why is it called skip counting?'
    ],
    practicePrompts: ['Count by 2s from 2 to 10.', 'Use your fingers to show counting by 2s.', 'Tell me what comes after 4 when skip counting by 2s.'],
    checkUnderstanding: 'Can you skip count by 2s all by yourself?',
    encouragementClose: 'Skip counting is fun and you are doing great.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 17
  },
  {
    grade: 'K', subject: 'Math', topic: 'Ordinal Numbers',
    lessonTitle: 'Ordinal Numbers - First to Fifth',
    learningGoal: 'Students will understand and use ordinal numbers first through fifth.',
    tutorIntroduction: 'Hello. Today we will learn about order. First, second, third, fourth, fifth. These words tell us where things are in line. Let\'s learn them.',
    guidedQuestions: [
      'If you line up your toys, which one is first?',
      'Can you point to the second toy in line?',
      'What does it mean to be third in line?',
      'If there are 5 children and you are last, are you fifth?',
      'Can you put things in order and tell me their positions?'
    ],
    practicePrompts: ['Line up 5 toys and tell me which is first, second, third, fourth, fifth.', 'Point to the third thing in a row.', 'Tell me which position comes after second.'],
    checkUnderstanding: 'What is the difference between 3 and third?',
    encouragementClose: 'You understand positions so well. Excellent.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 18
  },
  {
    grade: 'K', subject: 'Math', topic: 'Zero Concept',
    lessonTitle: 'Understanding Zero',
    learningGoal: 'Students will understand that zero means nothing or none.',
    tutorIntroduction: 'Hi there. Today we will talk about zero. Zero is a special number. It means we have nothing. Let\'s explore zero.',
    guidedQuestions: [
      'If you have 3 cookies and eat all 3, how many are left?',
      'What do we call it when we have nothing?',
      'Can you show me zero fingers?',
      'If there are no apples in the bowl, how many apples are there?',
      'Is zero the same as 1? Why not?'
    ],
    practicePrompts: ['Show me zero on your fingers.', 'Tell me when you might have zero of something.', 'Draw a picture of zero cookies.'],
    checkUnderstanding: 'Can you explain what zero means?',
    encouragementClose: 'You understand zero. That is very smart thinking.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 19
  },
  {
    grade: 'K', subject: 'Math', topic: 'Measurement',
    lessonTitle: 'Measuring with Objects',
    learningGoal: 'Students will compare lengths using non-standard units like blocks or crayons.',
    tutorIntroduction: 'Hello. Today we will measure things. We can use blocks or crayons to see how long something is. Let\'s measure together.',
    guidedQuestions: [
      'How many blocks long is your book? Let\'s count.',
      'Is your pencil longer or shorter than your crayon?',
      'If we line up 5 blocks, how long is that?',
      'Can you find something that is 3 crayons long?',
      'Which is longer, something that is 7 blocks or 4 blocks?'
    ],
    practicePrompts: ['Measure your book with blocks.', 'Find two things and tell me which is longer.', 'Use crayons to measure something in your room.'],
    checkUnderstanding: 'How do you know which thing is longer?',
    encouragementClose: 'You are learning to measure. Great job.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 20
  }
];

const kindergartenELALessons: LessonData[] = [
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letter A Sound',
    learningGoal: 'Students will identify the sound the letter A makes.',
    tutorIntroduction: 'Hi. Today we will learn the letter A and its sound. A says "ah" like in apple. Let\'s practice.',
    guidedQuestions: [
      'Can you say the sound A makes? Say "ah" with me.',
      'What word starts with A? Like apple?',
      'Can you think of other words that start with A?',
      'When you hear the word ant, what sound do you hear first?',
      'Can you point to the letter A?'
    ],
    practicePrompts: ['Say the A sound.', 'Tell me a word that starts with A.', 'Find the letter A on a page.'],
    checkUnderstanding: 'What sound does A make?',
    encouragementClose: 'You learned the A sound. Wonderful job.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 1
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letter B Sound',
    learningGoal: 'Students will identify the sound the letter B makes.',
    tutorIntroduction: 'Hello. Today we will learn about the letter B. B says "buh" like in ball. Let\'s learn together.',
    guidedQuestions: [
      'Can you say "buh" for the letter B?',
      'What words start with B? Like ball or book?',
      'If I say bat, what sound do you hear at the beginning?',
      'Can you find the letter B?',
      'Does bear start with B?'
    ],
    practicePrompts: ['Say the B sound.', 'Think of a word that starts with B.', 'Point to the letter B.'],
    checkUnderstanding: 'Can you tell me what sound B makes?',
    encouragementClose: 'Great job learning the B sound.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 2
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letter C Sound',
    learningGoal: 'Students will identify the sound the letter C makes.',
    tutorIntroduction: 'Hi there. Today we will learn the letter C. C says "kuh" like in cat. Let\'s practice this sound.',
    guidedQuestions: [
      'Can you say "kuh" for C?',
      'What starts with C? Like cat or car?',
      'When you hear cup, what sound is at the start?',
      'Can you draw the letter C?',
      'Does cow start with C?'
    ],
    practicePrompts: ['Say the C sound.', 'Name something that starts with C.', 'Find the letter C.'],
    checkUnderstanding: 'What does the letter C sound like?',
    encouragementClose: 'You are doing so well with letter sounds.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 3
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letter D Sound',
    learningGoal: 'Students will identify the sound the letter D makes.',
    tutorIntroduction: 'Hello. Today we learn about D. D says "duh" like in dog. Let\'s learn this new sound.',
    guidedQuestions: [
      'Can you say "duh" for the letter D?',
      'What words begin with D? Like dog or door?',
      'If I say duck, what sound starts the word?',
      'Can you find the letter D?',
      'Does dad start with D?'
    ],
    practicePrompts: ['Say the D sound.', 'Tell me a D word.', 'Point to the letter D.'],
    checkUnderstanding: 'What sound does D make?',
    encouragementClose: 'Excellent work learning D.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 4
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letter E Sound',
    learningGoal: 'Students will identify the sound the letter E makes.',
    tutorIntroduction: 'Hi. Today we learn the letter E. E says "eh" like in egg. Let\'s practice together.',
    guidedQuestions: [
      'Can you say "eh" for the letter E?',
      'What starts with E? Like egg or elephant?',
      'When you hear the word end, what sound do you hear first?',
      'Can you point to the letter E?',
      'Does elbow start with E?'
    ],
    practicePrompts: ['Say the E sound.', 'Name an E word.', 'Find the letter E on a page.'],
    checkUnderstanding: 'What does E sound like?',
    encouragementClose: 'You learned five letter sounds. Amazing.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 5
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letters F, G, H Sounds',
    learningGoal: 'Students will identify the sounds for letters F, G, and H.',
    tutorIntroduction: 'Hello there. Today we will learn three letters: F, G, and H. Let\'s learn their sounds together.',
    guidedQuestions: [
      'F says "fff" like in fish. Can you say "fff"?',
      'G says "guh" like in goat. Can you say "guh"?',
      'H says "huh" like in hat. Can you say "huh"?',
      'Which letter makes the sound at the start of frog?',
      'What about the start of home?'
    ],
    practicePrompts: ['Say the F, G, and H sounds.', 'Think of words for each letter.', 'Point to F, G, and H.'],
    checkUnderstanding: 'Can you remember all three sounds?',
    encouragementClose: 'You are learning so many letters. Great work.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 6
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letters I, J, K Sounds',
    learningGoal: 'Students will identify the sounds for letters I, J, and K.',
    tutorIntroduction: 'Hi. Today we will learn I, J, and K sounds. These are fun letters. Let\'s practice.',
    guidedQuestions: [
      'I says "ih" like in igloo. Can you say "ih"?',
      'J says "juh" like in jump. Can you say "juh"?',
      'K says "kuh" like in kite. Can you say "kuh"?',
      'What letter starts the word ink?',
      'What about the word king?'
    ],
    practicePrompts: ['Say the I, J, and K sounds.', 'Name words that start with these letters.', 'Find I, J, and K.'],
    checkUnderstanding: 'Which of these sounds do you like best?',
    encouragementClose: 'You are doing wonderful with letter sounds.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 7
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letters L, M, N Sounds',
    learningGoal: 'Students will identify the sounds for letters L, M, and N.',
    tutorIntroduction: 'Hello. Today we learn L, M, and N. These letters have nice sounds. Let\'s learn them.',
    guidedQuestions: [
      'L says "lll" like in lion. Can you say "lll"?',
      'M says "mmm" like in mom. Can you say "mmm"?',
      'N says "nnn" like in nose. Can you say "nnn"?',
      'Which letter starts the word moon?',
      'What about the word nut?'
    ],
    practicePrompts: ['Say L, M, and N sounds.', 'Think of words for each.', 'Point to these letters.'],
    checkUnderstanding: 'Can you say all three sounds again?',
    encouragementClose: 'You know so many letter sounds now. Excellent.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 8
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letters O, P, Q Sounds',
    learningGoal: 'Students will identify the sounds for letters O, P, and Q.',
    tutorIntroduction: 'Hi there. Today we will learn O, P, and Q. Let\'s practice these new sounds together.',
    guidedQuestions: [
      'O says "ah" like in octopus. Can you say "ah"?',
      'P says "puh" like in pig. Can you say "puh"?',
      'Q says "kwuh" like in queen. Can you say "kwuh"?',
      'What letter starts the word pan?',
      'What about quiz?'
    ],
    practicePrompts: ['Say O, P, and Q sounds.', 'Name words that start with these letters.', 'Find O, P, and Q.'],
    checkUnderstanding: 'Which sound is hardest to remember?',
    encouragementClose: 'You are learning the whole alphabet. Great job.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 9
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letters R, S, T Sounds',
    learningGoal: 'Students will identify the sounds for letters R, S, and T.',
    tutorIntroduction: 'Hello. Today we learn R, S, and T. These are important letters. Let\'s practice them.',
    guidedQuestions: [
      'R says "rrr" like in run. Can you say "rrr"?',
      'S says "sss" like in sun. Can you say "sss"?',
      'T says "tuh" like in top. Can you say "tuh"?',
      'Which letter starts the word sit?',
      'What about the word tree?'
    ],
    practicePrompts: ['Say R, S, and T sounds.', 'Think of words for each letter.', 'Point to R, S, and T.'],
    checkUnderstanding: 'Can you say these sounds again for me?',
    encouragementClose: 'You are really learning your letters well.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 10
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letters U, V, W Sounds',
    learningGoal: 'Students will identify the sounds for letters U, V, and W.',
    tutorIntroduction: 'Hi. Today we will learn U, V, and W. These are the last few letters. Let\'s learn them.',
    guidedQuestions: [
      'U says "uh" like in up. Can you say "uh"?',
      'V says "vvv" like in van. Can you say "vvv"?',
      'W says "wuh" like in water. Can you say "wuh"?',
      'What letter starts the word vest?',
      'What about the word umbrella?'
    ],
    practicePrompts: ['Say U, V, and W sounds.', 'Name words that start with these letters.', 'Find U, V, and W.'],
    checkUnderstanding: 'Which of these sounds is your favorite?',
    encouragementClose: 'Almost done with the alphabet. You are amazing.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 11
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Letter Sounds',
    lessonTitle: 'Letters X, Y, Z Sounds',
    learningGoal: 'Students will identify the sounds for letters X, Y, and Z.',
    tutorIntroduction: 'Hello there. Today we finish the alphabet with X, Y, and Z. Let\'s learn the last sounds.',
    guidedQuestions: [
      'X says "ks" like in fox. Can you say "ks"?',
      'Y says "yuh" like in yellow. Can you say "yuh"?',
      'Z says "zzz" like in zoo. Can you say "zzz"?',
      'What letter starts the word yes?',
      'What about zebra?'
    ],
    practicePrompts: ['Say X, Y, and Z sounds.', 'Think of words for each letter.', 'Point to X, Y, and Z.'],
    checkUnderstanding: 'You learned all 26 letters. Can you believe it?',
    encouragementClose: 'You know the whole alphabet. I am so proud of you.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 12
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Sight Words',
    lessonTitle: 'Sight Word - The',
    learningGoal: 'Students will recognize and read the sight word "the."',
    tutorIntroduction: 'Hi. Today we will learn a special word called "the." We see this word all the time. Let\'s practice it.',
    guidedQuestions: [
      'Can you say the word "the"?',
      'Can you find the word "the" on this page?',
      'How many letters are in "the"? Let\'s count.',
      'Can you use "the" in a sentence? Like "the dog"?',
      'When we read, do we see "the" a lot?'
    ],
    practicePrompts: ['Read the word "the" out loud.', 'Point to "the" in a book.', 'Say a sentence with "the."'],
    checkUnderstanding: 'Can you spell "the" for me?',
    encouragementClose: 'You learned the word "the." Great reading.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 13
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Sight Words',
    lessonTitle: 'Sight Word - A',
    learningGoal: 'Students will recognize and read the sight word "a."',
    tutorIntroduction: 'Hello. Today we learn the sight word "a." It is a very small word. Let\'s practice.',
    guidedQuestions: [
      'Can you say the word "a"?',
      'Can you find "a" on this page?',
      'How many letters are in "a"? Just one.',
      'Can you say a sentence with "a"? Like "a cat"?',
      'Is "a" easy to remember?'
    ],
    practicePrompts: ['Read the word "a" out loud.', 'Point to "a" in a sentence.', 'Use "a" in your own sentence.'],
    checkUnderstanding: 'What word is this: a?',
    encouragementClose: 'You are learning to read. Wonderful.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 14
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Sight Words',
    lessonTitle: 'Sight Word - Is',
    learningGoal: 'Students will recognize and read the sight word "is."',
    tutorIntroduction: 'Hi there. Today we will learn "is." This word helps us make sentences. Let\'s practice.',
    guidedQuestions: [
      'Can you say "is"?',
      'Can you find "is" in this sentence?',
      'How many letters are in "is"?',
      'Can you make a sentence with "is"? Like "The cat is big"?',
      'When do we use the word "is"?'
    ],
    practicePrompts: ['Read "is" out loud.', 'Point to "is" on a page.', 'Say a sentence with "is."'],
    checkUnderstanding: 'Can you read these three words: the, a, is?',
    encouragementClose: 'You know three sight words now. Excellent.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 15
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Rhyming',
    lessonTitle: 'Rhyming Words - AT Family',
    learningGoal: 'Students will identify and create rhymes using the "at" word family.',
    tutorIntroduction: 'Hello. Today we will learn about rhyming. Words that rhyme sound the same at the end. Let\'s try "at" words.',
    guidedQuestions: [
      'Do cat and hat rhyme? How can you tell?',
      'What other words rhyme with cat?',
      'If I say bat, does that rhyme with cat?',
      'Can you think of a word that rhymes with mat?',
      'Why do these words sound alike?'
    ],
    practicePrompts: ['Say three words that rhyme with cat.', 'Tell me if sat and hat rhyme.', 'Make up a word that rhymes with rat.'],
    checkUnderstanding: 'What does it mean when words rhyme?',
    encouragementClose: 'You are great at rhyming. Keep it up.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 16
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Rhyming',
    lessonTitle: 'Rhyming Words - AN Family',
    learningGoal: 'Students will identify and create rhymes using the "an" word family.',
    tutorIntroduction: 'Hi. Today we will practice rhyming with "an" words. Can, fan, man all rhyme. Let\'s learn more.',
    guidedQuestions: [
      'Do can and fan rhyme? Let\'s check.',
      'What other words rhyme with can?',
      'Does pan rhyme with can?',
      'Can you think of a word that rhymes with ran?',
      'Why do all these words sound alike at the end?'
    ],
    practicePrompts: ['Say three words that rhyme with man.', 'Tell me if van and tan rhyme.', 'Think of your own "an" word.'],
    checkUnderstanding: 'Can you make a rhyme with an "an" word?',
    encouragementClose: 'You are really good at finding rhymes.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 17
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Sentence Structure',
    lessonTitle: 'Sentences Need Capitals and Periods',
    learningGoal: 'Students will understand that sentences start with capital letters and end with periods.',
    tutorIntroduction: 'Hello there. Today we will learn about sentences. Every sentence starts with a big letter and ends with a dot called a period. Let\'s see how.',
    guidedQuestions: [
      'What is special about the first letter in a sentence?',
      'Can you show me a capital letter?',
      'What do we put at the end of a sentence?',
      'If I write "I like cats" is that a sentence? What does it need?',
      'Can you find the period at the end of this sentence?'
    ],
    practicePrompts: ['Write a sentence with a capital letter at the start.', 'Point to the period at the end.', 'Tell me what makes a good sentence.'],
    checkUnderstanding: 'What two things does every sentence need?',
    encouragementClose: 'You understand sentences. Great learning.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 18
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Reading Comprehension',
    lessonTitle: 'Reading Comprehension - Who Questions',
    learningGoal: 'Students will answer "who" questions about a simple story.',
    tutorIntroduction: 'Hi. Today we will read a story and talk about who is in it. Listening carefully helps us understand. Ready?',
    guidedQuestions: [
      'Who is in this story? Can you tell me?',
      'How did you know who the story is about?',
      'If I ask who went to the park, where would you look for the answer?',
      'Are there other people in the story? Who else?',
      'Why is it important to know who is in a story?'
    ],
    practicePrompts: ['Listen to this story and tell me who it is about.', 'Answer this question: Who ate the apple?', 'Point to the person in the picture who the story is about.'],
    checkUnderstanding: 'What does the word "who" help us find out?',
    encouragementClose: 'You listened so well. Excellent comprehension.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 19
  },
  {
    grade: 'K', subject: 'ELA', topic: 'Reading Comprehension',
    lessonTitle: 'Reading Comprehension - What Questions',
    learningGoal: 'Students will answer "what" questions about a simple story.',
    tutorIntroduction: 'Hello. Today we will read a story and talk about what happened. Knowing what happens is important. Let\'s listen.',
    guidedQuestions: [
      'What happened in the story? Can you tell me?',
      'What did the character do?',
      'If I ask what the dog ate, where do you find the answer?',
      'What else happened in the story?',
      'Why do we ask "what" questions?'
    ],
    practicePrompts: ['Listen and tell me what happened.', 'Answer this: What did the girl find?', 'Tell me what the story was about.'],
    checkUnderstanding: 'What does "what" help us understand about a story?',
    encouragementClose: 'You are becoming a great reader. Well done.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 20
  }
];

const kindergartenSpanishLessons: LessonData[] = [
  {
    grade: 'K', subject: 'Spanish', topic: 'Greetings',
    lessonTitle: 'Spanish Greetings',
    learningGoal: 'Students will learn to say hello and goodbye in Spanish.',
    tutorIntroduction: 'Hi there. Today we will learn how to say hello and goodbye in Spanish. Spanish is another language. Let\'s learn together.',
    guidedQuestions: [
      'In Spanish, hello is hola. Can you say hola?',
      'When do we say hello? Can you think of a time?',
      'Goodbye in Spanish is adios. Can you say adios?',
      'If you meet someone, would you say hola or adios?',
      'Can you say both words for me?'
    ],
    practicePrompts: ['Say hola when you greet someone.', 'Practice saying adios.', 'Use hola and adios in pretend conversations.'],
    checkUnderstanding: 'When would you use hola and when would you use adios?',
    encouragementClose: 'You are learning Spanish. Great job.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 1
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Numbers',
    lessonTitle: 'Spanish Numbers 1-5',
    learningGoal: 'Students will learn to count from 1 to 5 in Spanish.',
    tutorIntroduction: 'Hello. Today we will count in Spanish. We will learn uno, dos, tres, cuatro, cinco. Let\'s practice.',
    guidedQuestions: [
      'One in Spanish is uno. Can you say uno?',
      'Two is dos. Can you say dos?',
      'Three is tres. Can you say tres?',
      'Four is cuatro and five is cinco. Can you say those?',
      'Can you count to 5 in Spanish?'
    ],
    practicePrompts: ['Count from 1 to 5 in Spanish.', 'Say each number: uno, dos, tres, cuatro, cinco.', 'Hold up fingers while counting in Spanish.'],
    checkUnderstanding: 'Can you count to 5 in Spanish by yourself?',
    encouragementClose: 'You can count in Spanish. Wonderful.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 2
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Colors',
    lessonTitle: 'Spanish Colors',
    learningGoal: 'Students will learn three basic colors in Spanish.',
    tutorIntroduction: 'Hi. Today we will learn colors in Spanish. We will learn red, blue, and yellow. Let\'s see.',
    guidedQuestions: [
      'Red in Spanish is rojo. Can you say rojo?',
      'Blue is azul. Can you say azul?',
      'Yellow is amarillo. Can you say amarillo?',
      'Can you find something red and say rojo?',
      'What color is the sky? Can you say it in Spanish?'
    ],
    practicePrompts: ['Say rojo, azul, and amarillo.', 'Point to something and say its color in Spanish.', 'Tell me your favorite color in Spanish.'],
    checkUnderstanding: 'Can you remember all three colors in Spanish?',
    encouragementClose: 'You know colors in Spanish. Excellent work.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 3
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Vocabulary',
    lessonTitle: 'Spanish Common Objects',
    learningGoal: 'Students will learn Spanish words for book, dog, and cat.',
    tutorIntroduction: 'Hello there. Today we will learn words for things we see. Book, dog, and cat in Spanish. Let\'s learn.',
    guidedQuestions: [
      'Book in Spanish is libro. Can you say libro?',
      'Dog is perro. Can you say perro?',
      'Cat is gato. Can you say gato?',
      'Can you point to a book and say libro?',
      'Which word is your favorite?'
    ],
    practicePrompts: ['Say libro, perro, and gato.', 'Point to objects and say their Spanish names.', 'Use these words in pretend sentences.'],
    checkUnderstanding: 'Can you remember what libro means?',
    encouragementClose: 'You are learning Spanish words. Great job.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 4
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Polite Words',
    lessonTitle: 'Spanish Polite Words',
    learningGoal: 'Students will learn to say please and thank you in Spanish.',
    tutorIntroduction: 'Hi. Today we will learn polite words in Spanish. Please and thank you are important. Let\'s learn them.',
    guidedQuestions: [
      'Please in Spanish is por favor. Can you say por favor?',
      'When do we say please?',
      'Thank you is gracias. Can you say gracias?',
      'If someone gives you something, what do you say in Spanish?',
      'Can you use por favor when asking for something?'
    ],
    practicePrompts: ['Say por favor and gracias.', 'Practice asking politely in Spanish.', 'Say thank you in Spanish when someone helps you.'],
    checkUnderstanding: 'Why is it important to say please and thank you?',
    encouragementClose: 'You are polite in two languages. Wonderful.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 5
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Basic Responses',
    lessonTitle: 'Spanish Yes and No',
    learningGoal: 'Students will learn to say yes and no in Spanish.',
    tutorIntroduction: 'Hello. Today we learn how to say yes and no in Spanish. These are very useful words. Let\'s practice.',
    guidedQuestions: [
      'Yes in Spanish is si. Can you say si?',
      'No in Spanish is no. That\'s easy, right?',
      'If I ask you a question and you agree, do you say si or no?',
      'Can you answer a question in Spanish?',
      'Why are yes and no important words?'
    ],
    practicePrompts: ['Say si and no in Spanish.', 'Answer yes or no questions in Spanish.', 'Practice saying si when you agree.'],
    checkUnderstanding: 'What does si mean in English?',
    encouragementClose: 'You can answer in Spanish. Great learning.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 6
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Family',
    lessonTitle: 'Spanish Family Words',
    learningGoal: 'Students will learn to say mama, papa, and hermano/hermana in Spanish.',
    tutorIntroduction: 'Hi there. Today we will learn words for family members in Spanish. Mama, papa, brother, and sister. Let\'s learn together.',
    guidedQuestions: [
      'Mama in Spanish means mother. Can you say mama?',
      'Papa means father. Can you say papa?',
      'Brother is hermano. Can you say hermano?',
      'Sister is hermana. Can you say hermana?',
      'Can you tell me about your family in Spanish?'
    ],
    practicePrompts: ['Say mama, papa, hermano, and hermana.', 'Talk about your family using Spanish words.', 'Point to family members and say their names in Spanish.'],
    checkUnderstanding: 'What does hermano mean?',
    encouragementClose: 'You know family words in Spanish. Excellent.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 7
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Numbers',
    lessonTitle: 'Spanish Numbers 6-10',
    learningGoal: 'Students will learn to count from 6 to 10 in Spanish.',
    tutorIntroduction: 'Hello. Today we will continue counting in Spanish. We will learn seis, siete, ocho, nueve, diez. Let\'s practice.',
    guidedQuestions: [
      'Six in Spanish is seis. Can you say seis?',
      'Seven is siete. Can you say siete?',
      'Eight is ocho, nine is nueve, ten is diez. Can you say those?',
      'Can you count from 1 to 10 in Spanish now?',
      'Which Spanish number is hardest to say?'
    ],
    practicePrompts: ['Count from 6 to 10 in Spanish.', 'Say all the numbers from 1 to 10.', 'Count your fingers in Spanish.'],
    checkUnderstanding: 'Can you count to 10 in Spanish all by yourself?',
    encouragementClose: 'You can count to 10 in Spanish. Amazing work.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 8
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Conversation',
    lessonTitle: 'Spanish Simple Questions',
    learningGoal: 'Students will learn to ask and answer "How are you?" in Spanish.',
    tutorIntroduction: 'Hi. Today we will learn to ask someone how they are in Spanish. This is a friendly question. Let\'s learn.',
    guidedQuestions: [
      'How are you in Spanish is Como estas. Can you say that?',
      'If someone asks you Como estas, you can say Bien which means good. Can you say Bien?',
      'When would you ask someone Como estas?',
      'Can you ask me in Spanish?',
      'Why do we ask people how they are?'
    ],
    practicePrompts: ['Say Como estas.', 'Answer Bien when someone asks you.', 'Practice a conversation in Spanish.'],
    checkUnderstanding: 'What does Como estas mean?',
    encouragementClose: 'You can have a conversation in Spanish. Great job.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 9
  },
  {
    grade: 'K', subject: 'Spanish', topic: 'Review',
    lessonTitle: 'Spanish Review - All We Learned',
    learningGoal: 'Students will review all Spanish words and phrases learned.',
    tutorIntroduction: 'Hello there. Today we will review everything we learned in Spanish. You know so much. Let\'s practice it all.',
    guidedQuestions: [
      'Can you say hello and goodbye in Spanish?',
      'Can you count to 10 in Spanish?',
      'What are the three colors you learned?',
      'Can you say please and thank you?',
      'What is your favorite Spanish word?'
    ],
    practicePrompts: ['Count to 10 in Spanish.', 'Say all the colors, greetings, and polite words you know.', 'Have a pretend conversation in Spanish.'],
    checkUnderstanding: 'What Spanish words can you remember?',
    encouragementClose: 'You learned so much Spanish. I am so proud of you. Muy bien.',
    difficultyLevel: 1, estimatedMinutes: 10, orderIndex: 10
  }
];

async function seedLessons() {
  console.log('Starting lesson seed...');
  
  const allLessons = [
    ...kindergartenMathLessons,
    ...kindergartenELALessons,
    ...kindergartenSpanishLessons
  ];

  console.log(`Preparing to insert ${allLessons.length} lessons...`);

  try {
    for (const lesson of allLessons) {
      await db.insert(practiceLessons).values({
        grade: lesson.grade,
        subject: lesson.subject,
        topic: lesson.topic,
        lessonTitle: lesson.lessonTitle,
        learningGoal: lesson.learningGoal,
        tutorIntroduction: lesson.tutorIntroduction,
        guidedQuestions: lesson.guidedQuestions,
        practicePrompts: lesson.practicePrompts,
        checkUnderstanding: lesson.checkUnderstanding,
        encouragementClose: lesson.encouragementClose,
        difficultyLevel: lesson.difficultyLevel,
        estimatedMinutes: lesson.estimatedMinutes,
        orderIndex: lesson.orderIndex
      }).onConflictDoNothing();
    }
    
    console.log(`Successfully seeded ${allLessons.length} lessons!`);
  } catch (error) {
    console.error('Error seeding lessons:', error);
    throw error;
  }
}

seedLessons()
  .then(() => {
    console.log('Seed complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
