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
): Promise<PositionParams> => {
  const prompt = `
    Given this message: "${input}", extract the available data and return a JSON object with the following structure:h:
    {
      perpName: string | null,
      leverage: number | null,
      collateral: number | null,
      payToken: string | null,
      positionType: "long" | "short" | null,
      chainName : string | null
    }
    `;

  const content = await generateText({
    runtime,
    context: prompt,
    modelClass: ModelClass.LARGE,
    maxSteps: 1,
    customSystemPrompt: prompt,
  });
  const fetchedPositions = (parseJSONObjectFromText(
    content
  ) as PositionParams) || {
    perpName: null,
    leverage: null,
    collateral: null,
    payToken: null,
    positionType: null,
    chainName: null,
  };
  console.log("The Fetching is done", fetchedPositions);
  return fetchedPositions;
};

export type PositionParams = {
  perpName?: string;
  leverage?: number;
  collateral?: number;
  payToken?: "USDC" | "ETH";
  positionType?: "long" | "short";
  chainName: string;
};

export const openPostionAction: Action = {
  name: "OPEN_POSITION",
  similes: ["CREATE_POSITION", "MAKE_POSITION"],
  description:
    "Generates a json object with the details of the position the user wants to open in the market.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    if(message.content.text.toLowerCase().includes("deposit")){
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
      const result: PositionParams = await extractParamsFromText(
        message.content.text,
        runtime
      );
      const questions: Record<keyof PositionParams, string> = {
        perpName:
          "Which perpetual (like ETH, BTC) do you want to open a position in?",
        leverage: "How much leverage would you like to use?",
        collateral: "How much collateral are you providing?",
        payToken: "Which token are you using to pay? (USDC or ETH)",
        positionType: "Are you going long or short?",
        chainName: "Which can do you wish to deposit collateral on?",
      };

      if (socket_server && socket_server.of("/").sockets.size > 0) {
        socket_server.emit("open_position", {
          position:result,
          action:"OPEN_POSITION"
      });
        console.log("Emitted the socket event", result)
      } else {
        console.log("No active connections", socket_server);
      }

      const missingFields = Object.entries(questions).filter(
        ([field]) =>
          result[field as keyof PositionParams] === null ||
          result[field as keyof PositionParams] === undefined
      );

      if (missingFields.length > 0 && callback) {
        const [nextField, prompt] = missingFields[0];

        await callback({
          text: prompt,
          actions: ["REPLY"],
        });

        return false;
      }

      if (socket_server && socket_server.of("/").sockets.size > 0) {
        socket_server.emit("open_position", {
          position:result,
          action:"OPEN_POSITION"
      });
        console.log("Emitted the socket event", result)
      } else {
        console.log("No active connections", socket_server);
      }
      
      console.log(
        "Fetched params:",
        result.payToken,
        result.perpName,
        result.positionType,
        result.collateral,
        result.leverage
      );
      return true;
    } catch (error) {
      console.error("Failed to open position:", error);
      const result = {} as PositionParams;
      return result;
    }
  },

  examples: [
    [
      {
        user: "{{name1}}",
        content: {
          text: "i would like to open a long position on ETH perp with 10x leverage and 100 usdc as collateral",
        },
      },
      {
        user: "Sigma",
        content: {
          text: "Okay, Creating the params for you to create position",
          actions: ["OPEN_POSITION"],
        },
      },
    ],
    [
      {
        user: "{{name1}}",
        content: {
          text: "I want to open a position",
        },
      },
      {
        user: "Sigma",
        content: {
          text: "Got it. To proceed, I need a few details first.",
          actions: ["OPEN_POSITION"],
          queries: {
            perpName:
              "Which perpetual (like ETH, BTC) do you want to open a position in?",
            leverage: "How much leverage would you like to use?",
            collateral: "How much collateral are you providing?",
            payToken: "Which token are you using to pay? (USDC or ETH)",
            positionType: "Are you going long or short?",
          },
        },
      },
    ],
    [
      {
        user: "{{name1}}",
        content: {
          text: "I want to go long on BTC using USDC",
        },
      },
      {
        user: "Sigma",
        content: {
          text: "Got it! Just need a bit more info to proceed.",
          actions: ["OPEN_POSITION"],
          queries: {
            leverage: "How much leverage would you like to use?",
            collateral: "How much collateral are you providing?",
            chainName: "Which would you like to deposit USDC on?",
          },
        },
      },
    ],
    [
      {
        user: "{{name1}}",
        content: {
          text: "Open a position on ETH with 10x leverage using 200 as collateral",
        },
      },
      {
        user: "Sigma",
        content: {
          text: "Almost there! Could you tell me:",
          actions: ["OPEN_POSITION"],
          queries: {
            positionType: "Are you going long or short?",
            payToken: "Which token are you using to pay? (USDC or ETH)",
            chainName: "Which chain Would you like to deposit collateral on?",
          },
        },
      },
    ],
    [
      {
        user: "{{name1}}",
        content: {
          text: "I want to go long on BTC perp with 15x leverage using USDC",
        },
      },
      {
        user: "Sigma",
        content: {
          text: "Sure thing! How much collateral are you providing?",
          actions: ["OPEN_POSITION"],
          queries: {
            collateral: "How much collateral are you providing?",
            chain: "Which chain would you like to deposit USDC on?",
          },
        },
      },
    ],
    [
      {
        user: "{{name1}}",
        content: {
          text: "I want to go long on BTC perp with 15x leverage using 100 USDC as collateral on ethereum chain",
        },
      },
      {
        user: "Sigma",
        content: {
          text: `{
            perpName: "BTC",
            positionType: "long",
            collateralAmount: 100,
            payToken: "USDC",
            leverage: 15,
            chainName: "ethereum",
            }`,
          actions: ["OPEN_POSITION"],
        },
      },
    ],
  ],
};
