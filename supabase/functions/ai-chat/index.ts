import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatRequest {
  message: string;
  auth0AccessToken: string;
  auth0Domain: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { message, auth0AccessToken, auth0Domain }: ChatRequest = await req.json();

    if (!auth0AccessToken) {
      throw new Error("No Auth0 access token provided");
    }

    const payload = JSON.parse(atob(auth0AccessToken.split(".")[1]));
    const userId = payload.sub;

    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: message,
      requires_approval: false,
    });

    const needsApproval = checkIfNeedsApproval(message);

    if (needsApproval) {
      const authReqId = crypto.randomUUID();
      const bindingMessage = `AI wants to access your personal information to answer: "${message.substring(0, 100)}..."`;
      
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await supabase.from("ciba_auth_requests").insert({
        auth_req_id: authReqId,
        user_id: userId,
        binding_message: bindingMessage,
        scope: "openid profile email",
        status: "pending",
        expires_at: expiresAt.toISOString(),
      });

      await supabase.from("chat_messages").insert({
        user_id: userId,
        role: "assistant",
        content: "I need your permission to access your personal information to answer that question. Please approve the authorization request.",
        requires_approval: true,
      });

      return new Response(
        JSON.stringify({
          response: "I need your permission to access your personal information to answer that question. Please approve the authorization request.",
          requiresApproval: true,
          authReqId: authReqId,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const aiResponse = "I can answer general questions without accessing your personal data. For questions about your specific information, I'll need your approval first.";

    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: aiResponse,
      requires_approval: false,
    });

    return new Response(
      JSON.stringify({
        response: aiResponse,
        requiresApproval: false,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in ai-chat:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

function checkIfNeedsApproval(message: string): boolean {
  const sensitiveKeywords = [
    "my name",
    "my email",
    "who am i",
    "about me",
    "my profile",
    "my info",
    "my details",
    "tell me about myself",
    "what do you know about me",
  ];
  
  const lowerMessage = message.toLowerCase();
  return sensitiveKeywords.some(keyword => lowerMessage.includes(keyword));
}