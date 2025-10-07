import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ApprovalRequest {
  authReqId: string;
  action: "approved" | "denied";
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

    const { authReqId, action }: ApprovalRequest = await req.json();

    // Decode JWT to get user ID
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    const userId = payload.sub;

    // Verify the CIBA request belongs to this user
    const { data: cibaRequest, error: fetchError } = await supabase
      .from("ciba_auth_requests")
      .select("*")
      .eq("auth_req_id", authReqId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !cibaRequest) {
      throw new Error("CIBA request not found or unauthorized");
    }

    if (cibaRequest.status !== "pending") {
      throw new Error(`Request already ${cibaRequest.status}`);
    }

    // Check if expired
    if (new Date(cibaRequest.expires_at) < new Date()) {
      await supabase
        .from("ciba_auth_requests")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("auth_req_id", authReqId);

      throw new Error("Request has expired");
    }

    // Update CIBA request status
    const { error: updateError } = await supabase
      .from("ciba_auth_requests")
      .update({ 
        status: action,
        updated_at: new Date().toISOString()
      })
      .eq("auth_req_id", authReqId);

    if (updateError) {
      throw updateError;
    }

    // Record the approval/denial
    await supabase.from("user_approvals").insert({
      auth_req_id: cibaRequest.id,
      user_id: userId,
      action: action,
    });

    // If denied, add a message to chat
    if (action === "denied") {
      await supabase.from("chat_messages").insert({
        user_id: userId,
        role: "assistant",
        content: "You denied access to your personal information. I can only answer general questions without that access.",
        requires_approval: false,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: action,
        message: `Request ${action} successfully`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in ciba-approve:", error);
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
