import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, TrendingUp, Loader2, Clock, CheckCircle, Wifi, WifiOff } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataApi, Dataset, PipelineJob, UploadedFile } from "@/services/api";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function CleanData() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [originalPreview, setOriginalPreview] = useState<any[] | null>(null);
  const [cleanedPreview, setCleanedPreview] = useState<any[] | null>(null);
  const queryClient = useQueryClient();

  // Usar Supabase Realtime para seguimiento en tiempo real
  const {
    job: currentJob,
    isConnected,
    error: realtimeError,
    progress: jobProgress,
    status: jobStatus,
    message: jobMessage,
    metrics
  } = useSupabaseRealtime(currentJobId);

  // Fetch uploaded files (origen: archivos cargados)
  const { data: uploadedFiles = [], isLoading: filesLoading } = useQuery<UploadedFile[]>({
    queryKey: ['uploaded-files'],
    queryFn: dataApi.getUploadedFiles,
  });

  // Iniciar limpieza para un archivo ya cargado
  const startJobMutation = useMutation({
    mutationFn: (fileId: string) => dataApi.startCleanDataJob(fileId),
    onSuccess: (res) => {
      if (res?.job_id) {
        setCurrentJobId(res.job_id);
        toast.success('Limpieza iniciada');
      } else {
        toast.success('Limpieza en ejecución');
      }
    },
    onError: () => {
      toast.error('No se pudo iniciar la limpieza');
    },
  });

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => dataApi.uploadFile(file),
    onSuccess: (data) => {
      if (data.job_id) {
        setCurrentJobId(data.job_id);
        toast.success("Archivo subido y procesamiento iniciado");
        queryClient.invalidateQueries({ queryKey: ['uploaded-files'] });
        queryClient.invalidateQueries({ queryKey: ['cleaned-files'] });
      }
    },
    onError: () => {
      toast.error("Error al subir archivo");
    }
  });

  // Manejar cambios de estado del job
  useEffect(() => {
    if (jobStatus === 'completado') {
      toast.success("Limpieza completada exitosamente");
      queryClient.invalidateQueries({ queryKey: ['uploaded-files'] });
      queryClient.invalidateQueries({ queryKey: ['cleaned-files'] });
      
      // Cargar vistas previas de original y limpio si hay métricas
      const originalName = (currentJob as any)?.metricas_parciales?.original_filename;
      const cleanedName = (currentJob as any)?.metricas_parciales?.cleaned_filename;
      
      if (originalName) {
        dataApi.getFilePreview(originalName, 10).then(res => {
          const rows = Array.isArray(res.preview) ? res.preview : res;
          setOriginalPreview(rows);
        }).catch(() => setOriginalPreview(null));
      }
      
      if (cleanedName) {
        dataApi.getCleanedFilePreview(cleanedName, 10).then(res => {
          const rows = Array.isArray(res.preview) ? res.preview : res;
          setCleanedPreview(rows);
        }).catch(() => setCleanedPreview(null));
      }
      
      // No limpiar automáticamente - dejar que el usuario vea los resultados
      // setCurrentJobId(null);
      // setSelectedFileId(null);
      
    } else if (jobStatus === 'fallido') {
      toast.error("Error en la limpieza de datos");
      setCurrentJobId(null);
    }
  }, [jobStatus, queryClient, currentJob]);

  const getStepStatus = (stepName: string) => {
    if (!currentJob || jobStatus === 'pendiente') return "pending";
    if (jobStatus === 'fallido') return "error";
    if (jobStatus === 'completado') return "completed";

    const progress = jobProgress;
    if (stepName === "Cargando Datos" && progress >= 10) return "completed";
    if (stepName === "Valores Nulos" && progress >= 25) return "completed";
    if (stepName === "Duplicados" && progress >= 50) return "completed";
    if (stepName === "Normalización" && progress >= 75) return "completed";
    if (stepName === "Guardando Resultados" && progress >= 95) return "completed";

    if (stepName === "Cargando Datos" && progress >= 5) return "in-progress";
    if (stepName === "Valores Nulos" && progress >= 10) return "in-progress";
    if (stepName === "Duplicados" && progress >= 25) return "in-progress";
    if (stepName === "Normalización" && progress >= 50) return "in-progress";
    if (stepName === "Guardando Resultados" && progress >= 75) return "in-progress";

    return "pending";
  };

  const cleaningSteps = [
    { name: "Cargando Datos", status: getStepStatus("Cargando Datos"), impact: "Alto" },
    { name: "Valores Nulos", status: getStepStatus("Valores Nulos"), impact: "Alto" },
    { name: "Duplicados", status: getStepStatus("Duplicados"), impact: "Medio" },
    { name: "Normalización", status: getStepStatus("Normalización"), impact: "Alto" },
    { name: "Guardando Resultados", status: getStepStatus("Guardando Resultados"), impact: "Alto" },
  ];

  const dataQuality = [
    { metric: "Completitud", value: 95, color: "success" },
    { metric: "Consistencia", value: 88, color: "warning" },
    { metric: "Precisión", value: 92, color: "success" },
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error("Solo se permiten archivos CSV");
      return;
    }

    if (currentJobId && (jobStatus === 'en_progreso' || jobStatus === 'pendiente')) {
      toast.warning("Ya hay una limpieza en progreso");
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleStartCleaning = () => {
    if (!selectedFileId) {
      toast.warning('Selecciona un archivo cargado para limpiar');
      return;
    }
    if (currentJobId && (jobStatus === 'en_progreso' || jobStatus === 'pendiente')) {
      toast.warning('Ya hay una limpieza en progreso');
      return;
    }
    startJobMutation.mutate(selectedFileId);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-foreground mb-2">Limpieza de Datos</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Preprocesa y transforma tus datos para obtener mejores resultados
        </p>

        {/* File Upload */}
        <Card className="p-6 mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4">Subir Archivo CSV para Limpiar</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={uploadMutation.isPending || (currentJobId && jobStatus === 'en_progreso')}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer transition-colors ${
                  uploadMutation.isPending || (currentJobId && jobStatus === 'en_progreso')
                    ? 'border-muted bg-muted cursor-not-allowed'
                    : 'border-primary bg-primary/5 hover:bg-primary/10'
                }`}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )}
                <span>
                  {uploadMutation.isPending ? 'Subiendo...' : 'Seleccionar archivo CSV'}
                </span>
              </label>
              
              {/* Indicador de conexión Realtime */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm text-muted-foreground">
                  {isConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
            </div>
            {/* Lista de archivos cargados para seleccionar y limpiar */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Datos cargados</span>
                <Button
                  size="sm"
                  onClick={handleStartCleaning}
                  disabled={!selectedFileId || startJobMutation.isPending || (currentJobId && jobStatus === 'en_progreso')}
                >
                  {startJobMutation.isPending ? 'Iniciando…' : 'Iniciar limpieza'}
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {!filesLoading && uploadedFiles.length === 0 && (
                  <div className="text-sm text-muted-foreground">No hay datos cargados todavía</div>
                )}
                {uploadedFiles.map((f) => (
                  <button
                    key={f.id}
                    className={`text-left p-3 rounded border transition-colors ${
                      selectedFileId === f.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedFileId(f.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">{f.filename}</div>
                        <div className="text-xs text-muted-foreground">{new Date(f.modified).toLocaleString()}</div>
                      </div>
                      {selectedFileId === f.id && <CheckCircle className="w-4 h-4 text-primary" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {realtimeError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{realtimeError}</p>
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Pasos de Limpieza</h3>
            <div className="space-y-3">
              {cleaningSteps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {step.status === "completed" && (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                    {step.status === "in-progress" && (
                      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    )}
                    {step.status === "error" && (
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    )}
                    {step.status === "pending" && (
                      <div className="w-5 h-5 rounded-full border-2 border-muted" />
                    )}
                    <span className="font-medium text-foreground">{step.name}</span>
                  </div>
                  <Badge
                    variant={step.impact === "Alto" ? "default" : "secondary"}
                  >
                    {step.impact}
                  </Badge>
                </div>
              ))}
            </div>
            {/* Estado del Job en Tiempo Real */}
            {currentJobId && (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground">Progreso en Tiempo Real</h4>
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <Wifi className="w-4 h-4 text-green-500" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {isConnected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>
                </div>
                
                {jobStatus === 'en_progreso' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progreso General</span>
                      <span className="font-medium text-primary">{Math.round(jobProgress)}%</span>
                    </div>
                    <Progress value={jobProgress} className="h-3" />
                    
                    {jobMessage && (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <p className="text-sm text-foreground">{jobMessage}</p>
                      </div>
                    )}
                    
                    {metrics && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {metrics.duplicados_eliminados && (
                          <div className="bg-blue-50 p-2 rounded">
                            <span className="text-blue-700">Duplicados eliminados: {metrics.duplicados_eliminados}</span>
                          </div>
                        )}
                        {metrics.nulos_eliminados && (
                          <div className="bg-orange-50 p-2 rounded">
                            <span className="text-orange-700">Nulos eliminados: {metrics.nulos_eliminados}</span>
                          </div>
                        )}
                        {metrics.filas_originales && (
                          <div className="bg-green-50 p-2 rounded">
                            <span className="text-green-700">Filas originales: {metrics.filas_originales}</span>
                          </div>
                        )}
                        {metrics.filas_limpias && (
                          <div className="bg-purple-50 p-2 rounded">
                            <span className="text-purple-700">Filas limpias: {metrics.filas_limpias}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Vista previa en vivo desde metricas_parciales.preview */}
                    {Array.isArray((metrics as any)?.preview) && (metrics as any).preview.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-foreground mb-2">Vista previa en vivo (10 filas)</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {Object.keys((metrics as any).preview[0]).map((col: string) => (
                                <TableHead key={col}>{col}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(metrics as any).preview.map((row: any, idx: number) => (
                              <TableRow key={idx}>
                                {Object.keys((metrics as any).preview[0]).map((col: string) => (
                                  <TableCell key={col}>{String(row[col])}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}

                {jobStatus === 'completado' && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="w-5 h-5" />
                        <div>
                          <span className="text-sm font-medium">Limpieza completada exitosamente</span>
                          {metrics && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {metrics.filas_limpias} filas procesadas
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCurrentJobId(null);
                          setSelectedFileId(null);
                          setOriginalPreview(null);
                          setCleanedPreview(null);
                        }}
                        className="text-green-600 border-green-200 hover:bg-green-100"
                      >
                        Cerrar
                      </Button>
                    </div>
                  </div>
                )}
                
                {jobStatus === 'fallido' && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="text-sm font-medium">Error en la limpieza</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCurrentJobId(null);
                          setSelectedFileId(null);
                        }}
                        className="text-red-600 border-red-200 hover:bg-red-100"
                      >
                        Cerrar
                      </Button>
                    </div>
                  </div>
                )}
                
                {jobStatus === 'pendiente' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Esperando inicio...</span>
                  </div>
                )}
              </div>
            )}

            {/* Estado del Job - Versión anterior para compatibilidad */}
            {currentJobId && (
              <div className="mt-4">
                {jobStatus === 'completado' && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Limpieza completada exitosamente</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1">{jobMessage}</p>
                    {metrics && (
                      <div className="mt-2 text-xs text-green-600">
                        <p>Filas procesadas: {metrics.final_rows || 0}</p>
                        <p>Duplicados eliminados: {metrics.duplicates_removed || 0}</p>
                        <p>Valores nulos eliminados: {metrics.nulls_removed || 0}</p>
                      </div>
                    )}
                  </div>
                )}

                {jobStatus === 'fallido' && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Error en la limpieza</span>
                    </div>
                    <p className="text-xs text-red-600 mt-1">{jobMessage}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Calidad de Datos</h3>
            <div className="space-y-4">
              {dataQuality.map((item, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{item.metric}</span>
                    <span className="text-sm font-bold text-primary">{item.value}%</span>
                  </div>
                  <Progress value={item.value} className="h-2" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Resultados de la Limpieza - Sección Permanente */}
        {jobStatus === 'completado' && metrics && (
          <Card className="p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Resultados de la Limpieza</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentJobId(null);
                  setSelectedFileId(null);
                  setOriginalPreview(null);
                  setCleanedPreview(null);
                }}
                className="text-muted-foreground"
              >
                Cerrar Resultados
              </Button>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
              {/* Métricas de Limpieza */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-foreground">Estadísticas de Limpieza</h4>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <span className="text-sm font-medium text-blue-700">Filas Originales</span>
                    <span className="text-lg font-bold text-blue-900">{metrics.filas_originales || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span className="text-sm font-medium text-green-700">Filas Limpias</span>
                    <span className="text-lg font-bold text-green-900">{metrics.filas_limpias || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <span className="text-sm font-medium text-orange-700">Duplicados Eliminados</span>
                    <span className="text-lg font-bold text-orange-900">{metrics.duplicados_eliminados || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <span className="text-sm font-medium text-red-700">Valores Nulos Eliminados</span>
                    <span className="text-lg font-bold text-red-900">{metrics.nulos_eliminados || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                    <span className="text-sm font-medium text-purple-700">Columnas Procesadas</span>
                    <span className="text-lg font-bold text-purple-900">{metrics.columnas || 0}</span>
                  </div>
                </div>
              </div>

              {/* Vista Previa de Datos Limpiados */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-foreground">Vista Previa de Datos Limpiados</h4>
                {cleanedPreview && cleanedPreview.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(cleanedPreview[0]).slice(0, 4).map((col) => (
                            <TableHead key={col} className="text-xs">{col}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cleanedPreview.slice(0, 5).map((row: any, index: number) => (
                          <TableRow key={index}>
                            {Object.values(row).slice(0, 4).map((value: any, i: number) => (
                              <TableCell key={i} className="text-xs">{String(value)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Vista previa no disponible</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Transformaciones Aplicadas
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-success/10 border border-success/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-success" />
                <h4 className="font-semibold text-foreground">Normalización</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Escalado MinMax aplicado a todas las features numéricas
              </p>
            </div>

            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <h4 className="font-semibold text-foreground">Valores Nulos</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                8 valores nulos rellenados con la media
              </p>
            </div>

            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <h4 className="font-semibold text-foreground">Outliers</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                3 outliers detectados y removidos
              </p>
            </div>
          </div>
        </Card>

        {/* Vista previa comparativa: Original vs Limpio */}
        {jobStatus === 'completado' && (originalPreview || cleanedPreview) && (
          <Card className="p-6 mt-8">
            <h3 className="text-lg font-semibold text-foreground mb-4">Comparación de Datos (10 filas)</h3>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Original</h4>
                {originalPreview && originalPreview.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(originalPreview[0]).map((col) => (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {originalPreview.map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.keys(originalPreview[0]).map((col) => (
                            <TableCell key={col}>{String(row[col])}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-sm text-muted-foreground">No disponible</div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Limpio</h4>
                {cleanedPreview && cleanedPreview.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(cleanedPreview[0]).map((col) => (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cleanedPreview.map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.keys(cleanedPreview[0]).map((col) => (
                            <TableCell key={col}>{String(row[col])}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-sm text-muted-foreground">No disponible</div>
                )}
              </div>
            </div>

            {/* Resumen de métricas clave */}
            {metrics && (
              <div className="grid gap-4 md:grid-cols-3 mt-6">
                <div className="p-3 rounded border">
                  <div className="text-xs text-muted-foreground">Filas originales</div>
                  <div className="text-lg font-semibold">{metrics.original_rows ?? '-'}</div>
                </div>
                <div className="p-3 rounded border">
                  <div className="text-xs text-muted-foreground">Filas limpias</div>
                  <div className="text-lg font-semibold">{metrics.final_rows ?? '-'}</div>
                </div>
                <div className="p-3 rounded border">
                  <div className="text-xs text-muted-foreground">Duplicados eliminados</div>
                  <div className="text-lg font-semibold">{metrics.duplicates_removed ?? '-'}</div>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}