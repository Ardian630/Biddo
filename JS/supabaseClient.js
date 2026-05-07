// Si usas módulos de JavaScript modernos (Recomendado)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Sustituye con tus valores reales de Supabase
const supabaseUrl = 'https://alefrqhoerxxebegxwrr.supabase.co'
const supabaseAnonKey = 'sb_publishable_RS1AQYXjj1pOy7WQsA4Dvw_kYH9WQg4'

// Inicializamos el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

console.log("Conexión con Supabase configurada con éxito.");