import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xhnfkgjetwmezaywydzm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhobmZrZ2pldHdtZXpheXd5ZHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTM5MzMsImV4cCI6MjA3NTQyOTkzM30.Go5P6t2CJ8NSrLBxzlvVxY3NHIKNTZSKOau10V6dLqA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
