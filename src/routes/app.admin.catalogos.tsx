import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/PageHeader";
import { LineasTab } from "@/components/catalogos/LineasTab";
import { ServiciosTab } from "@/components/catalogos/ServiciosTab";
import { TiposEvaluacionTab } from "@/components/catalogos/TiposEvaluacionTab";
import { EnfasisTab } from "@/components/catalogos/EnfasisTab";

export const Route = createFileRoute("/app/admin/catalogos")({
  component: AdminCatalogos,
});

function AdminCatalogos() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        title="Catálogos"
        description="Líneas de servicio, servicios, tipos de evaluación y las pruebas que suma cada énfasis."
      />
      <Tabs defaultValue="lineas">
        <TabsList className="mb-4 h-auto flex-wrap justify-start">
          <TabsTrigger value="lineas">Líneas de servicio</TabsTrigger>
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="tipos">Tipos de evaluación</TabsTrigger>
          <TabsTrigger value="enfasis">Énfasis y pruebas</TabsTrigger>
        </TabsList>
        <TabsContent value="lineas"><LineasTab /></TabsContent>
        <TabsContent value="servicios"><ServiciosTab /></TabsContent>
        <TabsContent value="tipos"><TiposEvaluacionTab /></TabsContent>
        <TabsContent value="enfasis"><EnfasisTab /></TabsContent>
      </Tabs>
    </div>
  );
}
