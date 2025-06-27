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
  ): Promise<WithdrawParams> => {
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
    ) as WithdrawParams;
    console.log("The Fetching is done", fetchedDepositParams);
    return fetchedDepositParams;
  };
  
  export type WithdrawParams = {
    withdrawAmount:string | null;
  };
  
  export const depositAction: Action = {
    name: "WITHDRAW_AMOUNT",
    similes: ["WITHDRAW_AMOUNT"],
    description:
      "Generates a json object with the details of the position the user wants to close.",
  
    validate: async (runtime: IAgentRuntime, message: Memory) => {
      if(!message.content.text.toLowerCase().includes("withdraw")){
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
        const result: WithdrawParams= await extractParamsFromText(
          message.content.text,
          runtime
        );
        const questions: Record<keyof WithdrawParams, string> = {
           withdrawAmount:"Please select the amount you want to withdraw?"
        };
  
        const missingFields = Object.entries(questions).filter(
          ([field]) =>
            result[field as keyof WithdrawParams] === null ||
            result[field as keyof WithdrawParams] === undefined
        );
  
        if (socket_server && socket_server.of("/").sockets.size > 0) {
          socket_server.emit("withdraw_amount", {
            position:result,
            action:"WITHDRAW_AMOUNT"
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
            action:"WITHDRAW_AMOUNT"
        });
        } else {
          console.log("No active connections", socket_server);
        }
        console.log(
          "Fetched params:",
          result.withdrawAmount
        );
        return true;
      } catch (error) {
        console.error("Failed to create a deposit config:", error);
        const result = {} as WithdrawParams;
        return result;
      }
    },
  
    examples: [
      [
        {
          user: "{{name1}}",
          content: {
            text: "I would like to withdraw 10 usdc from my deposits ",
          },
        },
        {
          user: "Sigma",
          content: {
            text: "",
            actions: ["WITHDRAW_DEPOSIT"],
          },
        },
      ],
      [
        {
          user: "{{name1}}",
          content: {
            text: "I want to withdraw",
          },
        },
        {
          user: "Sigma",
          content: {
            text: "I need a few Details first",
            actions: ["WITHDRAW_DEPOSIT"],
            queries: {
              perpName:"Please provide the amount you wish to withdraw from your deposits"
            },
          },
        },
      ],
    ],
  };
  