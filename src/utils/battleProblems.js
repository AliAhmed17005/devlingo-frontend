// Collection of balanced, fast-executing coding challenges for 1v1 Battle Arena

export const BATTLE_PROBLEMS = [
  {
    id: "battle-rev-words",
    title: "Reverse Words in a String",
    difficulty: "Easy",
    topic: "Strings",
    timeLimit: 300, // 5 minutes
    description: "Write a function `reverse_words(s)` that takes a string containing space-separated words and returns the string with the order of the words reversed.",
    starterCode: `def reverse_words(s):
    # Your code here
    pass

# Test your function
print(reverse_words("hello world"))
`,
    functionName: "reverse_words",
    testCases: [
      { input: 'reverse_words("hello world")', expected: "world hello" },
      { input: 'reverse_words("python live coding battle")', expected: "battle coding live python" },
      { input: 'reverse_words("devlingo")', expected: "devlingo" }
    ],
    hint: "You can split the string by whitespace, reverse the list of words, and join them back with spaces."
  },
  {
    id: "battle-palindrome",
    title: "Valid Palindrome",
    difficulty: "Easy",
    topic: "Strings",
    timeLimit: 300,
    description: "Write a function `is_palindrome(s)` that determines if a string is a palindrome. Ignore cases and consider only alphanumeric characters (a-z, 0-9). Return `True` or `False`.",
    starterCode: `def is_palindrome(s):
    # Your code here
    pass

# Test your function
print(is_palindrome("Race car"))
`,
    functionName: "is_palindrome",
    testCases: [
      { input: 'is_palindrome("racecar")', expected: "True" },
      { input: 'is_palindrome("A man a plan a canal Panama")', expected: "True" },
      { input: 'is_palindrome("hello world")', expected: "False" }
    ],
    hint: "Filter characters with c.isalnum(), convert to lowercase, and check if it equals its reverse."
  },
  {
    id: "battle-two-sum",
    title: "Two Sum Target",
    difficulty: "Medium",
    topic: "Algorithms",
    timeLimit: 360,
    description: "Write a function `two_sum(nums, target)` that returns the 0-based indices of the two numbers in `nums` such that they add up to `target`. Return the indices as a sorted list `[i, j]`.",
    starterCode: `def two_sum(nums, target):
    # Your code here
    pass

# Test your function
print(two_sum([2, 7, 11, 15], 9))
`,
    functionName: "two_sum",
    testCases: [
      { input: 'two_sum([2, 7, 11, 15], 9)', expected: "[0, 1]" },
      { input: 'two_sum([3, 2, 4], 6)', expected: "[1, 2]" },
      { input: 'two_sum([3, 3], 6)', expected: "[0, 1]" }
    ],
    hint: "Use a dictionary to keep track of complements: target - num -> index."
  },
  {
    id: "battle-missing-num",
    title: "Find Missing Number",
    difficulty: "Easy",
    topic: "Math & Arrays",
    timeLimit: 300,
    description: "Given a list `nums` containing `n` distinct numbers in the range `[0, n]`, return the only number in the range that is missing from the list.",
    starterCode: `def missing_number(nums):
    # Your code here
    pass

# Test your function
print(missing_number([3, 0, 1]))
`,
    functionName: "missing_number",
    testCases: [
      { input: 'missing_number([3, 0, 1])', expected: "2" },
      { input: 'missing_number([0, 1])', expected: "2" },
      { input: 'missing_number([9, 6, 4, 2, 3, 5, 7, 0, 1])', expected: "8" }
    ],
    hint: "The sum of numbers from 0 to n is n * (n + 1) // 2. Subtract the actual sum of nums."
  },
  {
    id: "battle-vowels",
    title: "Count Vowels",
    difficulty: "Easy",
    topic: "Strings",
    timeLimit: 240,
    description: "Write a function `count_vowels(s)` that returns the total count of vowels ('a', 'e', 'i', 'o', 'u', case-insensitive) in the string `s`.",
    starterCode: `def count_vowels(s):
    # Your code here
    pass

# Test your function
print(count_vowels("DevLingo 1v1 Battle"))
`,
    functionName: "count_vowels",
    testCases: [
      { input: 'count_vowels("DevLingo 1v1 Battle")', expected: "7" },
      { input: 'count_vowels("Python")', expected: "1" },
      { input: 'count_vowels("rhythm")', expected: "0" }
    ],
    hint: "Iterate through the string in lowercase and sum up matches in 'aeiou'."
  },
  {
    id: "battle-fibonacci",
    title: "N-th Fibonacci Number",
    difficulty: "Medium",
    topic: "Algorithms",
    timeLimit: 300,
    description: "Write a function `fibonacci(n)` that returns the n-th Fibonacci number. Assume fibonacci(0) = 0 and fibonacci(1) = 1. For example, fibonacci(6) is 8.",
    starterCode: `def fibonacci(n):
    # Your code here
    pass

# Test your function
print(fibonacci(6))
`,
    functionName: "fibonacci",
    testCases: [
      { input: 'fibonacci(0)', expected: "0" },
      { input: 'fibonacci(6)', expected: "8" },
      { input: 'fibonacci(10)', expected: "55" }
    ],
    hint: "Use an iterative loop with two variables a, b = 0, 1."
  }
];

export function getRandomBattleProblem() {
  const index = Math.floor(Math.random() * BATTLE_PROBLEMS.length);
  return BATTLE_PROBLEMS[index];
}

export function getBattleProblemById(id) {
  return BATTLE_PROBLEMS.find(p => p.id === id) || BATTLE_PROBLEMS[0];
}
