import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { BrandScreen } from "@/features/home/BrandScreen";
export const Route = createRoute({ getParentRoute:()=>rootRoute, path:"/brands", component:()=> <AppLayout screen="projects"><BrandScreen/></AppLayout> });
