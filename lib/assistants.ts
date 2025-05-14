import { User, Building, HardHat, Mountain, Compass, Pencil, Briefcase, type LucideIcon } from "lucide-react"

// Define the structure of an assistant
export type Assistant = {
  id: string
  assistant_id: string // OpenAI Assistant ID
  name: string
  role: string
  shortDescription: string
  description: string
  iconType: LucideIcon
  bgColor: string
}

// List of available assistants
export const assistants: Assistant[] = [
  // Administrativos
  {
    id: "yurena-administrativa",
    assistant_id: process.env.YURENA_ADMINISTRATIVA_ASSISTANT_ID || "asst_9JaSPgLJRP0QMqFdZTgPIfWB",
    name: "Yurena",
    role: "Administrativa",
    shortDescription: "Asistente administrativa",
    description: "Asistente especializada en tareas administrativas y gestión documental.",
    iconType: User,
    bgColor: "bg-sistema-primary",
  },
  {
    id: "cristina-administrativa",
    assistant_id: process.env.CRISTINA_ADMINISTRATIVA_ASSISTANT_ID || "asst_tAsPk1hqHYs9pCZQlY1ywoL6",
    name: "Cristina",
    role: "Administrativa",
    shortDescription: "Asistente administrativa",
    description: "Asistente especializada en tareas administrativas y gestión documental.",
    iconType: User,
    bgColor: "bg-sistema-primary",
  },

  // Ingenieros Civiles (no managers)
  {
    id: "laura-ingeniera-civil",
    assistant_id: process.env.LAURA_INGENIERA_CIVIL_ASSISTANT_ID || "asst_2orsrKiOvPEJcBWhejKfowJ0",
    name: "Laura",
    role: "Ingeniera Civil",
    shortDescription: "Especialista en ingeniería civil",
    description: "Ingeniera civil con experiencia en diseño y cálculo de estructuras.",
    iconType: Building,
    bgColor: "bg-sistema-secondary",
  },
  {
    id: "miriam-ingeniera-caminos",
    assistant_id: process.env.MIRIAM_INGENIERA_CAMINOS_ASSISTANT_ID || "asst_urGBhJYlA3rPHToQHtg3swpk",
    name: "Miriam",
    role: "Ingeniera de Caminos",
    shortDescription: "Especialista en ingeniería de caminos",
    description: "Ingeniera de caminos con experiencia en proyectos de infraestructura.",
    iconType: Building,
    bgColor: "bg-sistema-secondary",
  },

  // Ingenieros Civiles (especialistas en ejecución de obra)
  {
    id: "pedro-ingeniero-civil-ejecucion",
    assistant_id: process.env.PEDRO_INGENIERO_CIVIL_EJECUCION_OBRA_ASSISTANT_ID || "asst_j8KMVhmLS4JBPLlYtQXuUv6r",
    name: "Pedro",
    role: "Ingeniero Civil - Ejecución de Obra",
    shortDescription: "Especialista en ejecución de obra",
    description: "Ingeniero civil especializado en la ejecución y supervisión de obras.",
    iconType: HardHat,
    bgColor: "bg-sistema-secondary-dark",
  },

  // Delineantes y Modeladores BIM
  {
    id: "paco-delineante-bim",
    assistant_id: process.env.PACO_DELINEANTE_MODELADOR_BIM_ASSISTANT_ID || "asst_oYhNKYylA5opblnsKvfjvUJS",
    name: "Paco",
    role: "Delineante y Modelador BIM",
    shortDescription: "Especialista en modelado BIM",
    description: "Delineante y modelador BIM con experiencia en proyectos de edificación e infraestructura.",
    iconType: Pencil,
    bgColor: "bg-sistema-accent",
  },
  {
    id: "mawi-delineante-bim",
    assistant_id: process.env.MAWI_DELINEANTE_MODELADORA_BIM_ASSISTANT_ID || "asst_DW5387x8VbFxOxyCkxwwxn95",
    name: "Mawi",
    role: "Delineante y Modeladora BIM",
    shortDescription: "Especialista en modelado BIM",
    description: "Delineante y modeladora BIM con experiencia en proyectos de edificación e infraestructura.",
    iconType: Pencil,
    bgColor: "bg-sistema-accent",
  },

  // Topógrafos
  {
    id: "cristina-topografa",
    assistant_id: process.env.CRISTINA_TOPOGRAFA_ASSISTANT_ID || "asst_fMaTdVFehX2XDPs37mbxvP0R",
    name: "Cristina",
    role: "Topógrafa",
    shortDescription: "Especialista en topografía",
    description: "Topógrafa con experiencia en levantamientos topográficos y replanteos.",
    iconType: Mountain,
    bgColor: "bg-sistema-accent-dark",
  },

  // Ingenieros de Caminos (Managers de Equipo)
  {
    id: "mario-ingeniero-caminos-manager",
    assistant_id: process.env.MARIO_INGENIERO_CAMINOS_MANAGER_ASSISTANT_ID || "asst_jACpbs8wQjPIRk3qhdBAjwFq",
    name: "Mario",
    role: "Ingeniero de Caminos - Manager",
    shortDescription: "Manager de equipo de ingeniería",
    description: "Ingeniero de caminos con experiencia en gestión de equipos y proyectos.",
    iconType: Compass,
    bgColor: "bg-sistema-primary-dark",
  },
  {
    id: "jose-ingeniero-caminos-manager",
    assistant_id: process.env.JOSE_INGENIERO_CAMINOS_MANAGER_ASSISTANT_ID || "asst_D8Em3vfDCUslRyr5OQdBTn6c",
    name: "José",
    role: "Ingeniero de Caminos - Manager",
    shortDescription: "Manager de equipo de ingeniería",
    description: "Ingeniero de caminos con experiencia en gestión de equipos y proyectos.",
    iconType: Compass,
    bgColor: "bg-sistema-primary-dark",
  },
  {
    id: "neli-ingeniera-caminos-manager",
    assistant_id: process.env.NELI_INGENIERA_CAMINOS_MANAGER_ASSISTANT_ID || "asst_D8Em3vfDCUslRyr5OQdBTn6c",
    name: "Neli",
    role: "Ingeniera de Caminos - Manager",
    shortDescription: "Manager de equipo de ingeniería",
    description: "Ingeniera de caminos con experiencia en gestión de equipos y proyectos.",
    iconType: Compass,
    bgColor: "bg-sistema-primary-dark",
  },

  // CEO
  {
    id: "eduardo-ceo", // Asegurando que el id es exactamente este string
    assistant_id: process.env.EDUARDO_CEO_SISTEMA_SA_ASSISTANT_ID || "asst_r4TbLXhnmXKMqYNt8byDO91j",
    name: "Eduardo",
    role: "CEO",
    shortDescription: "CEO de SISTEMA INGENIERÍA",
    description: "CEO y fundador de SISTEMA INGENIERÍA, con amplia experiencia en el sector.",
    iconType: Briefcase,
    bgColor: "bg-sistema-dark",
  },
]

// Group assistants by role
export const assistantGroups = [
  {
    title: "Dirección",
    assistants: assistants.filter((a) => a.role === "CEO"),
  },
  {
    title: "Managers",
    assistants: assistants.filter((a) => a.role.includes("Manager")),
  },
  {
    title: "Ingenieros",
    assistants: assistants.filter(
      (a) => (a.role.includes("Ingenier") && !a.role.includes("Manager")) || a.role.includes("Topógraf"),
    ),
  },
  {
    title: "Delineantes y BIM",
    assistants: assistants.filter((a) => a.role.includes("Delineante") || a.role.includes("BIM")),
  },
  {
    title: "Administración",
    assistants: assistants.filter((a) => a.role.includes("Administrativa")),
  },
]

// Function to get an assistant by its ID
export const getAssistantById = (id: string): Assistant | undefined => {
  return assistants.find((assistant) => assistant.id === id)
}
