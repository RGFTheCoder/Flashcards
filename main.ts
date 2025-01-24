import { walk, exists } from "@std/fs";
import { levenshteinDistance, wordSimilaritySort } from "@std/text";

function sleep(s) {
  const { promise, resolve } = Promise.withResolvers();

  setTimeout(resolve, s * 1000);

  return promise;
}

function shuffle_array<T>(array: T[]) {
  // Create a new array with the length of the given array in the parameters
  const newArray: (T | null)[] = array.map(() => null);

  // Create a new array where each index contain the index value
  const arrayReference = array.map((_, index) => index);

  function randomize(item: T) {
    const randomIndex = getRandomIndex();

    // Replace the value in the new array
    newArray[arrayReference[randomIndex]] = item;

    // Remove in the array reference the index used
    arrayReference.splice(randomIndex, 1);
  }

  // Return a number between 0 and current array reference length
  function getRandomIndex() {
    const min = 0;
    const max = arrayReference.length;
    return Math.floor(Math.random() * (max - min)) + min;
  }

  // Iterate on the array given in the parameters
  array.forEach(randomize);

  return newArray as T[];
}

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
async function main() {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");
  if (!(await exists("./user.json"))) {
    await Deno.writeFile(
      "./user.json",
      encoder.encode(
        JSON.stringify({
          known: {},
        }),
      ),
    );
  }

  const user_data = JSON.parse(
    decoder.decode(await Deno.readFile("./user.json")),
  ) as { known: { [id: string]: number } };

  const sets = new Set<string>();

  for await (const walkEntry of walk("./sets")) {
    const type = walkEntry.isSymlink
      ? "symlink"
      : walkEntry.isFile
        ? "file"
        : "directory";

    if (type == "file") sets.add(walkEntry.path);
  }

  const matcher = new RegExp(Deno.args[0] ?? ".");

  const matched_sets = [...sets]
    .filter((x) => matcher.test(x))
    .map((x) => x.substring(5, x.length - 5));

  const pretty_names = matched_sets.map((x) =>
    x
      .split("_")
      .map((y) => y[0].toUpperCase() + y.substring(1))
      .join(" ")
      .split("/")
      .map((y) => y[0].toUpperCase() + y.substring(1))
      .join("/"),
  );

  console.clear();
  console.log("Starting study session for:", pretty_names.join(", "));

  const questions: {
    [id: string]: {
      question: string;
      answer: string;
      rank: number;
      id: string;
    };
  } = {};

  const data = (
    await Promise.all(
      matched_sets.map(async (set, i) => {
        const path = `./sets/${set}.json`;
        const contents = JSON.parse(decoder.decode(await Deno.readFile(path)));

        contents.forEach(
          (x: { id: string; q: string; a: string; r: boolean }) => {
            x.id = `${set}/${contents.id ?? `Q${i}`}`;
          },
        );

        const max_L = contents.length;

        for (let i = 0; i < max_L; i++) {
          if (contents[i].r) {
            contents.push({
              id: contents[i].id + "_R",
              q: contents[i].a,
              a: contents[i].q,
              r: true,
            });
          }
        }

        return contents as { id: string; q: string; a: string; r: boolean }[];
      }),
    )
  ).flat(1);

  const all_answers = [];

  for (const { a, q, id } of data) {
    questions[id] = {
      question: q,
      answer: a,
      rank: user_data.known[id] ?? 0,
      id,
    };
    all_answers.push(a);
  }

  async function save_data() {
    for (const question in questions) {
      user_data.known[question] = questions[question].rank;

      if (questions[question].rank == 0) delete questions[question];
    }

    await Deno.writeFile(
      "./user.json",
      encoder.encode(JSON.stringify(user_data)),
    );
  }

  let iteration = 0;

  while (true) {
    const relevant_questions = shuffle_array(
      Object.values(questions).filter((x) => iteration % 2 ** x.rank == 0),
    );

    for (const question of relevant_questions) {
      const correct =
        question.rank > 2
          ? free_resp(question.question, question.answer)
          : multiple_choice(question.question, question.answer, all_answers, 4);

      if (correct == "EXIT") {
        await save_data();

        return;
      }

      question.rank += correct == "CORRECT" ? 1 : -1;
      if (question.rank < 0) question.rank = 0;

      console.log();
      if (correct == "CORRECT") {
        console.log("%cCorrect", "color: lime;");
      } else {
        console.log("%cIncorrect", "color: red;");
      }

      await sleep(0.4);
    }

    iteration++;
  }
}

type Q_RESP = "CORRECT" | "WRONG" | "EXIT";

/**
 * Multiple choice handler (Put correct answer as first option).
 */
function multiple_choice(
  question: string,
  answer: string,
  all_answers: string[],
  count: number = 4,
): Q_RESP {
  console.clear();
  const relevant_options = wordSimilaritySort(answer, all_answers);

  const options = shuffle_array(relevant_options.slice(0, count));

  console.log(question);
  console.log();
  options.forEach((ans, i) => console.log(`[${i}]: ${ans}`));
  console.log();

  const selection = prompt("Enter answer number: ");

  if (selection == null) return "EXIT";

  return options[+selection] == answer ? "CORRECT" : "WRONG";
}

/**
 * Free-Response Handler
 */
function free_resp(question: string, answer: string): Q_RESP {
  console.clear();
  console.log(question);
  console.log();

  const selection = prompt("A: ");

  if (selection == null) return "EXIT";

  if (selection != answer) {
    const dist = levenshteinDistance(selection, answer);

    if (dist < 3) {
      const is_correct = prompt(`Is your answer ${answer}? `);

      return (is_correct || "n")[0].toLowerCase() == "n" ? "CORRECT" : "WRONG";
    } else {
      return "WRONG";
    }
  }

  return "CORRECT";
}

if (import.meta.main) main();
