import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  useClasificaciones, useAddClasificacion, useUpdateClasificacion, useDeleteClasificacion,
  useDepartamentosMedicos, useAddDepartamentoMedico, useUpdateDepartamentoMedico, useDeleteDepartamentoMedico,
  useTiposExamen, useAddTipoExamen, useUpdateTipoExamen, useDeleteTipoExamen,
} from "@/lib/hooks/useCatalogos";
import type { TipoExamen } from "@/lib/database.types";

export const Route = createFileRoute("/app/admin/catalogos")({
  component: AdminCatalogos,
});

// ─── Panel genérico para clasificaciones y departamentos ───────────────────────

interface SimplePanelProps {
  items: { id: string; nombre: string }[];
  onAdd: (nombre: string) => Promise<void>;
  onUpdate: (args: { id: string; nombre: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  placeholder: string;
}

function SimplePanel({ items, onAdd, onUpdate, onDelete, placeholder }: SimplePanelProps) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await onAdd(name);
      setNewName("");
    } catch (e: any) {
      toast.error(e.message ?? "Error al agregar");
    }
  };

  const startEdit = (id: string, nombre: string) => {
    setEditId(id);
    setEditName(nombre);
  };

  const saveEdit = async () => {
    if (!editId) return;
    try {
      await onUpdate({ id: editId, nombre: editName.trim() });
      setEditId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    }
  };

  const cancelEdit = () => setEditId(null);

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
    } catch (e: any) {
      toast.error(e.message ?? "Error al eliminar");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd}>Agregar</Button>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-2">
            {editId === item.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                  autoFocus
                />
                <Button size="icon" variant="ghost" onClick={saveEdit} className="h-7 w-7">
                  <Check className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-7 w-7">
                  <X className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{item.nombre}</span>
                <Button size="icon" variant="ghost" onClick={() => startEdit(item.id, item.nombre)} className="h-7 w-7">
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(item.id)} className="h-7 w-7 text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-sm text-muted-foreground">Sin elementos.</li>}
      </ul>
    </div>
  );
}

// ─── Panel de tipos de examen ──────────────────────────────────────────────────

function TiposExamenPanel() {
  const { data: tipos = [] } = useTiposExamen();
  const addTipo = useAddTipoExamen();
  const updateTipo = useUpdateTipoExamen();
  const deleteTipo = useDeleteTipoExamen();

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await addTipo.mutateAsync(name);
      setNewName("");
    } catch (e: any) {
      toast.error(e.message ?? "Error al agregar");
    }
  };

  const startEdit = (t: TipoExamen) => { setEditId(t.id); setEditName(t.nombre); };
  const cancelEdit = () => setEditId(null);

  const saveEdit = async (t: TipoExamen) => {
    try {
      await updateTipo.mutateAsync({ id: t.id, nombre: editName.trim(), roles_permitidos: t.roles_permitidos });
      setEditId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    }
  };

  const toggleRole = async (t: TipoExamen, role: string, checked: boolean) => {
    const roles = checked
      ? [...t.roles_permitidos, role]
      : t.roles_permitidos.filter((r) => r !== role);
    try {
      await updateTipo.mutateAsync({ id: t.id, nombre: t.nombre, roles_permitidos: roles });
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTipo.mutateAsync(id);
    } catch (e: any) {
      toast.error(e.message ?? "Error al eliminar");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nuevo tipo de examen"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd}>Agregar</Button>
      </div>
      <div className="text-xs text-muted-foreground mb-1">Marca los roles que pueden solicitar cada tipo de examen:</div>
      <ul className="divide-y">
        {tipos.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2">
            {editId === t.id ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t); if (e.key === "Escape") cancelEdit(); }}
                autoFocus
              />
            ) : (
              <span className="flex-1 text-sm">{t.nombre}</span>
            )}
            <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
              <Checkbox
                checked={t.roles_permitidos.includes("empresa")}
                onCheckedChange={(c) => toggleRole(t, "empresa", !!c)}
              />
              Empresa
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
              <Checkbox
                checked={t.roles_permitidos.includes("particular")}
                onCheckedChange={(c) => toggleRole(t, "particular", !!c)}
              />
              Particular
            </label>
            {editId === t.id ? (
              <>
                <Button size="icon" variant="ghost" onClick={() => saveEdit(t)} className="h-7 w-7"><Check className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-7 w-7"><X className="w-3 h-3" /></Button>
              </>
            ) : (
              <>
                <Button size="icon" variant="ghost" onClick={() => startEdit(t)} className="h-7 w-7"><Pencil className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(t.id)} className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
              </>
            )}
          </li>
        ))}
        {tipos.length === 0 && <li className="py-2 text-sm text-muted-foreground">Sin tipos de examen.</li>}
      </ul>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

function AdminCatalogos() {
  const { data: clasificaciones = [] } = useClasificaciones();
  const addC = useAddClasificacion();
  const updateC = useUpdateClasificacion();
  const deleteC = useDeleteClasificacion();

  const { data: deptos = [] } = useDepartamentosMedicos();
  const addD = useAddDepartamentoMedico();
  const updateD = useUpdateDepartamentoMedico();
  const deleteD = useDeleteDepartamentoMedico();

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Catálogos</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="clasificaciones">
          <TabsList className="mb-4">
            <TabsTrigger value="clasificaciones">Clasificaciones IPS</TabsTrigger>
            <TabsTrigger value="departamentos">Departamentos Médicos</TabsTrigger>
            <TabsTrigger value="tipos_examen">Tipos de Examen</TabsTrigger>
          </TabsList>

          <TabsContent value="clasificaciones">
            <SimplePanel
              items={clasificaciones}
              onAdd={(n) => addC.mutateAsync(n)}
              onUpdate={(a) => updateC.mutateAsync(a)}
              onDelete={(id) => deleteC.mutateAsync(id)}
              placeholder="Nueva clasificación"
            />
          </TabsContent>

          <TabsContent value="departamentos">
            <SimplePanel
              items={deptos}
              onAdd={(n) => addD.mutateAsync(n)}
              onUpdate={(a) => updateD.mutateAsync(a)}
              onDelete={(id) => deleteD.mutateAsync(id)}
              placeholder="Nuevo departamento médico"
            />
          </TabsContent>

          <TabsContent value="tipos_examen">
            <TiposExamenPanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
