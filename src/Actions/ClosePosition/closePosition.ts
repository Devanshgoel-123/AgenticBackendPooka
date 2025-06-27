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
  ): Promise<ClosePositionParams> => {
    console.log("The agent runtime is", input);
    const prompt = `
      Given this message: "${input}", extract the available data and return a JSON object with the following structure:h:
      {
        perpName:string | null,
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
    ) as ClosePositionParams;
    console.log("The Fetching is done", fetchedDepositParams);
    return fetchedDepositParams;
  };
  
  export type ClosePositionParams = {
    perpName:string | null;
  };
  
  export const depositAction: Action = {
    name: "CLOSE_POSITION",
    similes: ["CLOSE_POSITION", "CLOSE_POSITION"],
    description:
      "Generates a json object with the details of the position the user wants to close.",
  
    validate: async (runtime: IAgentRuntime, message: Memory) => {
      if(!message.content.text.toLowerCase().includes("close")){
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
        const result: ClosePositionParams = await extractParamsFromText(
          message.content.text,
          runtime
        );
        const questions: Record<keyof ClosePositionParams, string> = {
           perpName:"Please select the market where you want to close your position?"
        };
  
        const missingFields = Object.entries(questions).filter(
          ([field]) =>
            result[field as keyof ClosePositionParams] === null ||
            result[field as keyof ClosePositionParams] === undefined
        );
  
        if (socket_server && socket_server.of("/").sockets.size > 0) {
          socket_server.emit("close_position", {
            position:result,
            action:"CLOSE_POSITION"
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
          socket_server.emit("", {
            position:result,
            action:"CLOSE_POSITION"
        });
        } else {
          console.log("No active connections", socket_server);
        }
        console.log(
          "Fetched params:",
          result.perpName
        );
        return true;
      } catch (error) {
        console.error("Failed to create a deposit config:", error);
        const result = {} as ClosePositionParams;
        return result;
      }
    },
  
    examples: [
      [
        {
          user: "{{name1}}",
          content: {
            text: "I would like to close my position on BTC perp",
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
            text: "I want to close position",
          },
        },
        {
          user: "Sigma",
          content: {
            text: "I need a few Details first",
            actions: ["CLOSE_POSITION"],
            queries: {
              perpName:"Please provide the name of the market where you want to close your position"
            },
          },
        },
      ],
    ],
  };
  