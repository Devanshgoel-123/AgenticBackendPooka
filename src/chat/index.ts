import { settings } from "@elizaos/core";


export const handleUserInput=async(input:string , agentId:string)=>{
  try {
    const serverPort = parseInt(settings.SERVER_PORT || "4000");
    console.log(serverPort, agentId, input)
    const response = await fetch(
      `http://localhost:${serverPort}/${agentId}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          userId: "user",
          userName: "User",
        }),
      }
    );
    console.log("The data",response);
    const data = await response.json();
    console.log("The response from the agent is",data);
    let answer=[];
    data.forEach((message) => answer.push(`${"Agent"}: ${message.text}`));
    return answer
  } catch (error) {
    console.error("Error fetching response:", error);
    return "error";
  }
}

