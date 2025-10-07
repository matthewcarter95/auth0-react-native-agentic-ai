import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PollRequest {
  authReqId: string;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { authReqId, auth0AccessToken, auth0Domain }: PollRequest = await req.json();

    // Decode JWT to get user ID
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    const userId = payload.sub;

    // Check CIBA request status
    const { data: cibaRequest, error } = await supabase
      .from("ciba_auth_requests")
      .select("*")
      .eq("auth_req_id", authReqId)
      .eq("user_id", userId)
      .single();

    if (error || !cibaRequest) {
      throw new Error("CIBA request not found");
    }

    // Check if expired
    if (new Date(cibaRequest.expires_at) < new Date()) {
      await supabase
        .from("ciba_auth_requests")
        .update({ status: "expired" })
        .eq("auth_req_id", authReqId);

      return new Response(
        JSON.stringify({
          status: "expired",
          message: "Authorization request expired",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // If approved, fetch user info from Auth0 and return AI response
    if (cibaRequest.status === "approved") {
      const userInfoResponse = await fetch(`https://${auth0Domain}/userinfo`, {
        headers: {
          Authorization: `Bearer ${auth0AccessToken}`,
        },
      });

      if (!userInfoResponse.ok) {
        throw new Error("Failed to fetch user info from Auth0");
      }

      const userInfo = await userInfoResponse.json();

      // Get the original question from chat history
      const { data: messages } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", userId)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1);

      const lastQuestion = messages?.[0]?.content || "";

      // Generate AI response based on user info
      const aiResponse = generatePersonalizedResponse(lastQuestion, userInfo);

      // Store AI response
      await supabase.from("chat_messages").insert({
        user_id: userId,
        role: "assistant",
        content: aiResponse,
        requires_approval: false,
      });

      return new Response(
        JSON.stringify({
          status: "approved",
          response: aiResponse,
          userInfo: userInfo,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Return current status
    return new Response(
      JSON.stringify({
        status: cibaRequest.status,
        message: `Request is ${cibaRequest.status}`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in ciba-poll:", error);
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

function generatePersonalizedResponse(question: string, userInfo: any): string {
  const lowerQuestion = question.toLowerCase();
  
  if (lowerQuestion.includes("my name") || lowerQuestion.includes("who am i")) {
    return `Your name is ${userInfo.name || "not set in your profile"}. Your email is ${userInfo.email || "not available"}.`;
  }
  
  if (lowerQuestion.includes("my email")) {
    return `Your email address is ${userInfo.email || "not available"}.`;
  }
  
  if (lowerQuestion.includes("about me") || lowerQuestion.includes("my profile")) {
    const info = [];
    if (userInfo.name) info.push(`Name: ${userInfo.name}`);
    if (userInfo.email) info.push(`Email: ${userInfo.email}`);
    if (userInfo.nickname) info.push(`Nickname: ${userInfo.nickname}`);
    if (userInfo.picture) info.push(`You have a profile picture set`);
    if (userInfo.email_verified) info.push(`Your email is verified`);
    
    return info.length > 0 
      ? `Here's what I know about you:\n${info.join("\n")}`
      : "I don't have much information about your profile.";
  }
  
  // Default response with available info
  return `Based on your profile: You are ${userInfo.name || "a user"} (${userInfo.email || "no email"}). How can I help you further?`;
}
