import { DirectClient } from "@elizaos/client-direct";
import { openPostionAction } from "./Actions/OpenPosition/openPosition.ts";
import {
  AgentRuntime,
  elizaLogger,
  settings,
  stringToUuid,
  type Character,
} from "@elizaos/core";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import { createNodePlugin } from "@elizaos/plugin-node";
import fs from "fs";
import { initializeDbCache } from "./cache/index.ts";
import { handleUserInput } from "./chat/index.ts";
import { initializeClients } from "./clients/index.ts";
import {
  getTokenForProvider,
  loadCharacters,
  parseArguments,
} from "./config/index.ts";
import { initializeDatabase } from "./database/index.ts";
import { PookaCharacter } from "./character.ts";
import express, { Request, Response } from 'express';
import bodyParser from "body-parser";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
import path from 'path';
import { depositAction } from "./Actions/DepositAmount/deposit.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app=express();
app.use(bodyParser.json())
const httpServer=createServer(app)
const io=new Server(httpServer, {

})

const runtimeMap = new Map<string, AgentRuntime>();


export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
  const waitTime =
    Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};

let nodePlugin: any | undefined;

export function createAgent(
  character: Character,
  db: any,
  cache: any,
  token: string
) {
  elizaLogger.success(
    elizaLogger.successesTitle,
    "Creating runtime for character",
    character.name,
  );

  nodePlugin ??= createNodePlugin();

  return new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: character.modelProvider,
    evaluators: [],
    character,
    plugins: [
      bootstrapPlugin,
      nodePlugin,
    ].filter(Boolean),
    providers: [],
    actions: [
      openPostionAction, 
      depositAction
    ],
    services: [],
    managers: [],
    cacheManager: cache,
  });
}

async function startAgent(character: Character, directClient: DirectClient) {
  try {
    character.id ??= stringToUuid(character.name);
    character.username ??= character.name;
    console.log('character name', character.name);
    const token = getTokenForProvider(character.modelProvider, character);
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = initializeDatabase(dataDir);

    await db.init();

    const cache = initializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    await runtime.initialize();

    runtime.clients = await initializeClients(character, runtime);

    directClient.registerAgent(runtime);

    // report to console
    elizaLogger.debug(`Started ${character.name} as ${runtime.agentId}`);

    return runtime;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${character.name}:`,
      error,
    );
    console.error(error);
    throw error;
  }
}

const startAgents = async () => {
  const directClient = new DirectClient();
  let serverPort = parseInt(settings.SERVER_PORT || "4000");
  const args = parseArguments();
  let characters = [PookaCharacter];

  console.log("characters",characters[0].name);
  try {
    for (const character of characters) {
      const runtime = await startAgent(character, directClient as DirectClient);
      console.log("The agent runtime is",runtime.serverUrl, runtime)
      runtimeMap.set(character.name, runtime);
    }
  } catch (error) {
    elizaLogger.error("Error starting agents:", error);
  }
  directClient.startAgent = async (character: Character) => {
    return startAgent(character, directClient);
  };

  directClient.start(serverPort)

  if (serverPort !== parseInt(settings.SERVER_PORT || "3000")) {
    elizaLogger.log(`Server started on alternate port ${serverPort}`);
  }

};

app.post('/message', async (req:Request, res:Response):Promise<any>=>{
  const { text, agentId } = req.body;
  console.log(agentId, text)
  const runtime = runtimeMap.get(agentId);
  if (!runtime) {
    return res.status(404).json({ error: "Agent not found" });
  }

  try {
    const messages = await handleUserInput(text,agentId)
    return res.status(200).json({
      response:messages
    })
  } catch (err) {
    console.error("Agent handling error:", err);
    return res.status(500).json({ error: "Agent failed to process input" });
  }
})


startAgents()
.then(() => {
    httpServer.listen(5432, () => {
      console.log("Server with WebSocket and REST API listening on port 4000");
    });
})
  .catch((err) => {
    console.error("Failed to start agents:", err);
});