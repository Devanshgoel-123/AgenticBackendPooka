import {
  Action,
  Memory,
  State,
  HandlerCallback,
  ServiceType,
} from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import { generateText, IAgentRuntime, ModelClass } from "@elizaos/core";
import { parseJSONObjectFromText } from "@elizaos/core";
import { socket_server } from "../../index.ts";
export const extractParamsFromText = async (
  input: string,
  runtime: IAgentRuntime
): Promise<DepositParams> => {
  console.log("The agent runtime is", input);
  const prompt = `
    Given this message: "${input}", extract the available data and return a JSON object with the following structure:h:
    {
      collateral:number | null,
      payToken:string | null,
      chainName:string | null
    }
    `;

  const content = await generateText({
    runtime,
    context: prompt,
    modelClass: ModelClass.LARGE,
    maxSteps: 1,
    customSystemPrompt: prompt,
  });
  const fetchedDepositParams = parseJSONObjectFromText(
    content
  ) as DepositParams;
  console.log("The Fetching is done", fetchedDepositParams);
  return fetchedDepositParams;
};

export type DepositParams = {
  collateral?: number;
  payToken?: string;
  chainName: string;
};

export const depositAction: Action = {
  name: "DEPOSIT_COLLATERAL",
  similes: ["CREATE_DEPOSIT", "MAKE_DEPOSIT"],
  description:
    "Generates a json object with the details of the deposit the user wants to perform.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    if(!message.content.text.toLowerCase().includes("deposit")){
      return false;
    }
    const config = await extractParamsFromText(message.content.text, runtime);
    if (!config) {
      elizaLogger.warn("Validation failed: No valid configuration provided.");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: any,
    callback?: HandlerCallback
  ) => {
    try {
      console.log("Start managing positions");
      if (!state) {
        state = (await runtime.composeState(message)) as State;
      } else {
        state = await runtime.updateRecentMessageState(state);
      }
      const result: DepositParams = await extractParamsFromText(
        message.content.text,
        runtime
      );
      const questions: Record<keyof DepositParams, string> = {
        collateral: "How much collateral are you providing?",
        payToken: "Which token are you using to pay? (USDC or ETH)",
        chainName: "Which chain do you want to deposit on?",
      };

      const missingFields = Object.entries(questions).filter(
        ([field]) =>
          result[field as keyof DepositParams] === null ||
          result[field as keyof DepositParams] === undefined
      );

      if (socket_server && socket_server.of("/").sockets.size > 0) {
        socket_server.emit("deposit_collateral", {
          position:result,
          action:"DEPOSIT_COLLATERAL"
      });
      } else {
        console.log("No active connections", socket_server);
      }
      if (missingFields.length > 0 && callback) {
        const [nextField, prompt] = missingFields[0];

        await callback({
          text: prompt,
          actions: ["REPLY"],
        });

        return false;
      }
      if (socket_server && socket_server.of("/").sockets.size > 0) {
        socket_server.emit("deposit_collateral", {
          position:result,
          action:"DEPOSIT_COLLATERAL"
      });
      } else {
        console.log("No active connections", socket_server);
      }
      console.log(
        "Fetched params:",
        result.payToken,
        result.collateral,
        result.chainName
      );
      return true;
    } catch (error) {
      console.error("Failed to create a deposit config:", error);
      const result = {} as DepositParams;
      return result;
    }
  },

  examples: [
    [
      {
        user: "{{name1}}",
        content: {
          text: "I would like to create a deposit of 100 usdc on eth chain",
        },
      },
      {
        user: "Sigma",
        content: {
          text: "",
          actions: ["DEPOSIT_COLLATERAL"],
        },
      },
    ],
    [
      {
        user: "{{name1}}",
        content: {
          text: "I want to make a deposit",
        },
      },
      {
        user: "Sigma",
        content: {
          text: "I need a few Details first",
          actions: ["DEPOSIT_COLLATERAL"],
          queries: {
            collateral: "How much collateral are you providing?",
            payToken:
              "Which token are you using to deposit collateral? (USDC or ETH)",
            chainName: "Which chain would you like to deposit assets on?",
          },
        },
      },
    ],
    [
      {
        user: "{{name1}}",
        content: {
          text: "I want to deposit USDC",
        },
      },
      {
        user: "Sigma",
        content: {
          text: "",
          actions: ["DEPOSIT_COLLATERAL"],
          queries: {
            collateral: "How much USDC do you want to provide?",
            chainName: "Which would you like to deposit USDC on?",
          },
        },
      },
    ],
  ],
};
