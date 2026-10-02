// Run this file ONCE to seed your Firestore database with course data
// Import and call seedDatabase() in your App.js temporarily

import { db } from "./config";
import { doc, setDoc } from "firebase/firestore";

export const COURSES_DATA = [
  {
    id: "python-basics",
    title: "Python Basics",
    description: "Learn Python from scratch — variables, loops, functions, and data structures",
    category: "Programming",
    level: "Beginner",
    lessons: 24,
    weeks: 6,
    instructor: "Dr. Sarah Khan",
    rating: 4.9,
    enrolled: 12400,
    color: "#6366f1",
    icon: "🐍",
    topics: [
      { id: "t1", title: "Variables & Data Types", order: 1, xp: 50 },
      { id: "t2", title: "Conditionals", order: 2, xp: 60 },
      { id: "t3", title: "Loops", order: 3, xp: 70 },
      { id: "t4", title: "Functions & Scope", order: 4, xp: 80 },
      { id: "t5", title: "Lists & Dictionaries", order: 5, xp: 90 },
      { id: "t6", title: "File I/O", order: 6, xp: 100 },
    ],
    assessmentQuestions: [
      { q: "What does print() do in Python?", options: ["Prints to screen","Deletes output","Creates loop","None"], answer: 0 },
      { q: "Which keyword defines a function?", options: ["func","define","def","function"], answer: 2 },
      { q: "What is the output of: 2 ** 3", options: ["5","6","8","9"], answer: 2 },
      { q: "How do you create a list in Python?", options: ["{}","[]","()","<>"], answer: 1 },
      { q: "Which of these is a valid variable name?", options: ["2name","my-var","_name","name val"], answer: 2 },
    ]
  },
  {
    id: "javascript-mastery",
    title: "JavaScript Mastery",
    description: "Master modern JavaScript — ES6+, async/await, DOM, and frameworks",
    category: "Web Dev",
    level: "Intermediate",
    lessons: 32,
    weeks: 8,
    instructor: "Ali Hassan",
    rating: 4.8,
    enrolled: 9800,
    color: "#f59e0b",
    icon: "🟨",
    topics: [
      { id: "t1", title: "Variables & Data Types", order: 1, xp: 50 },
      { id: "t2", title: "Functions & Scope", order: 2, xp: 60 },
      { id: "t3", title: "Arrays & Objects", order: 3, xp: 70 },
      { id: "t4", title: "Async JavaScript", order: 4, xp: 80 },
      { id: "t5", title: "Promises & Async/Await", order: 5, xp: 90 },
      { id: "t6", title: "ES6+ Features", order: 6, xp: 100 },
    ],
    assessmentQuestions: [
      { q: "What does === check in JavaScript?", options: ["Value only","Type only","Value and type","Neither"], answer: 2 },
      { q: "Which method adds to end of array?", options: ["shift","unshift","push","pop"], answer: 2 },
      { q: "What is a Promise?", options: ["A variable","Async operation result","A loop","A class"], answer: 1 },
      { q: "Arrow function syntax?", options: ["function()=>","()=>{}","=>()","func=>"], answer: 1 },
      { q: "What does 'let' create?", options: ["Constant","Global var","Block scoped var","Function"], answer: 2 },
    ]
  },
  {
    id: "react-nextjs",
    title: "React & Next.js Pro",
    description: "Build modern web apps with React hooks, context, and Next.js",
    category: "Web Dev",
    level: "Advanced",
    lessons: 40,
    weeks: 10,
    instructor: "Omar Sheikh",
    rating: 4.7,
    enrolled: 7200,
    color: "#0f9b8e",
    icon: "⚛️",
    topics: [
      { id: "t1", title: "React Components", order: 1, xp: 60 },
      { id: "t2", title: "Hooks (useState, useEffect)", order: 2, xp: 80 },
      { id: "t3", title: "Context & State Management", order: 3, xp: 100 },
      { id: "t4", title: "Next.js Routing", order: 4, xp: 120 },
      { id: "t5", title: "API Routes", order: 5, xp: 140 },
    ],
    assessmentQuestions: [
      { q: "What is JSX?", options: ["JavaScript XML","Java Syntax","JSON XML","None"], answer: 0 },
      { q: "Which hook manages state?", options: ["useEffect","useRef","useState","useCallback"], answer: 2 },
      { q: "What does useEffect do?", options: ["Renders UI","Side effects","Creates state","Routes pages"], answer: 1 },
      { q: "Props are?", options: ["Mutable state","Read-only data","CSS classes","Events"], answer: 1 },
      { q: "Virtual DOM purpose?", options: ["Store data","Performance optimization","Style elements","Handle events"], answer: 1 },
    ]
  }
];

export const PROBLEMS_DATA = [
  // Python Basics - Easy MCQ
  { id: "p001", courseId: "python-basics", topicId: "t3", difficulty: "easy", type: "mcq",
    title: "Basic for loop",
    description: "How many times does this loop run?\n```python\nfor i in range(5):\n    print(i)\n```",
    options: ["3 times","4 times","5 times","6 times"], correctAnswer: 2,
    explanation: "range(5) generates 0,1,2,3,4 — that is 5 iterations." },

  { id: "p002", courseId: "python-basics", topicId: "t3", difficulty: "easy", type: "mcq",
    title: "While loop condition",
    description: "What does this print?\n```python\nx = 0\nwhile x < 3:\n    x += 1\nprint(x)\n```",
    options: ["0","1","2","3"], correctAnswer: 3,
    explanation: "The loop runs until x=3, then exits. print(x) shows 3." },

  // Python Basics - Medium MCQ
  { id: "p003", courseId: "python-basics", topicId: "t4", difficulty: "medium", type: "mcq",
    title: "Function with default parameter",
    description: "Which correctly defines a function with a default parameter?",
    options: ["def greet(name='World'):","def greet(name=World):","def greet('World'=name):","def greet[name='World']:"],
    correctAnswer: 0,
    explanation: "Default parameters use = inside the parentheses with the value in quotes if it's a string." },

  { id: "p004", courseId: "python-basics", topicId: "t4", difficulty: "medium", type: "mcq",
    title: "Return value",
    description: "What does this function return?\n```python\ndef add(a, b):\n    result = a + b\n```",
    options: ["a + b","result","0","None"], correctAnswer: 3,
    explanation: "A function without a return statement returns None by default." },

  // Python Basics - Hard MCQ
  { id: "p005", courseId: "python-basics", topicId: "t5", difficulty: "hard", type: "mcq",
    title: "List comprehension",
    description: "What does this produce?\n```python\nresult = [x*2 for x in range(4)]\n```",
    options: ["[0,2,4,6]","[1,2,3,4]","[2,4,6,8]","[0,1,2,3]"], correctAnswer: 0,
    explanation: "x*2 for x in range(4): 0*2=0, 1*2=2, 2*2=4, 3*2=6 → [0,2,4,6]" },

  // Python Basics - Coding problems
  { id: "p006", courseId: "python-basics", topicId: "t3", difficulty: "easy", type: "coding",
    title: "Print numbers 1 to 5",
    description: "Write a Python program that prints numbers from 1 to 5, each on a new line.",
    starterCode: "# Write your solution here\nfor i in range(1, 6):\n    print(i)",
    expectedOutput: "1\n2\n3\n4\n5",
    explanation: "Use range(1, 6) to get numbers 1 through 5." },

  { id: "p007", courseId: "python-basics", topicId: "t4", difficulty: "medium", type: "coding",
    title: "Function: Calculate Area",
    description: "Write a function called `area` that takes `length` and `width` and returns their product. Call it with length=5, width=3 and print the result.",
    starterCode: "# Write your function here\ndef area(length, width):\n    return length * width\n\nprint(area(5, 3))",
    expectedOutput: "15",
    explanation: "Multiply length * width and return the result." },

  { id: "p008", courseId: "python-basics", topicId: "t5", difficulty: "hard", type: "coding",
    title: "List sum without sum()",
    description: "Given the list `numbers = [10, 20, 30, 40, 50]`, write code to calculate and print the total sum WITHOUT using the built-in sum() function.",
    starterCode: "numbers = [10, 20, 30, 40, 50]\ntotal = 0\nfor num in numbers:\n    total += num\nprint(total)",
    expectedOutput: "150",
    explanation: "Iterate through the list and accumulate the total using a variable." },

  // JavaScript Mastery problems
  { id: "p009", courseId: "javascript-mastery", topicId: "t3", difficulty: "easy", type: "mcq",
    title: "Array method",
    description: "Which method adds an element to the end of an array?",
    options: ["shift()","unshift()","push()","splice()"], correctAnswer: 2,
    explanation: "push() adds elements to the end. unshift() adds to the beginning." },

  { id: "p010", courseId: "javascript-mastery", topicId: "t4", difficulty: "medium", type: "mcq",
    title: "Async/Await",
    description: "What keyword pauses execution until a Promise resolves?",
    options: ["async","wait","await","pause"], correctAnswer: 2,
    explanation: "await pauses execution inside an async function until the Promise resolves." },
];

export async function seedDatabase() {
  console.log("Seeding database...");
  for (const course of COURSES_DATA) {
    const { id, ...courseData } = course;
    await setDoc(doc(db, "courses", id), courseData);
    console.log(`Seeded course: ${course.title}`);
  }
  for (const problem of PROBLEMS_DATA) {
    const { id, ...problemData } = problem;
    await setDoc(doc(db, "problems", id), problemData);
    console.log(`Seeded problem: ${problem.title}`);
  }
  console.log("Database seeded successfully!");
}
