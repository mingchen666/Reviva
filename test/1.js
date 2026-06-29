import * as z from "zod";
import { tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";


import { createDeepAgent } from "deepagents";
const getWeather = tool(
  ({ city }) => `It's always sunny in ${city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string(),
    }),
  },
);


const model = new ChatOpenAI({
  model: "LongCat-Flash-Chat" ,
  apiKey: "ak_1nC4zp1Di6589AU02N98x5l30EU8w", 
  configuration: {
    baseURL: "https://api.longcat.chat/openai/v1", 
  },
});

const agent = createDeepAgent({
  model,
  tools: [getWeather],
  systemPrompt: "You are a helpful assistant",
});

async function main() {
  try {
    const result = await agent.invoke({
      messages: [{ role: "user", content: "Tokyo天气怎么样?" }],
    });
    const lastMessage = result.messages[result.messages.length - 1];
    console.log("Agent 回复:", lastMessage.content);
  } catch (error) {
    console.error("出错了:", error);
  }
}
main();