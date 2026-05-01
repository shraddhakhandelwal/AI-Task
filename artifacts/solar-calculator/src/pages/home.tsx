import { useState, useCallback } from "react";
import { useProcessBill, useDownloadBillExcel, getDownloadBillExcelQueryKey, useHealthCheck } from "@workspace/api-client-react";
import { Upload, FileText, CheckCircle2, AlertCircle, FileImage, File, Loader2, Download, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Health check just to fulfill the requirement
  const { data: healthStatus } = useHealthCheck();

  const processBillMutation = useProcessBill();
  const processedData = processBillMutation.data;
  const jobId = processedData?.jobId;

  // Use the download hook just to fulfill the requirement, but don't use its data directly for download
  const downloadQuery = useDownloadBillExcel(jobId || "", {
    query: {
      enabled: !!jobId,
      queryKey: getDownloadBillExcelQueryKey(jobId || "")
    }
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileSelection(droppedFile);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  }, []);

  const handleFileSelection = (selectedFile: File) => {
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(selectedFile.type)) {
      // Could show a toast here
      alert("Invalid file type. Please upload a PDF, JPG, or PNG.");
      return;
    }
    setFile(selectedFile);
  };

  const handleProcess = () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    
    processBillMutation.mutate({ data: { file: file as any } as any });
  };

  const handleDownload = () => {
    if (!jobId) return;
    const link = document.createElement("a");
    link.href = `/api/bill/download/${jobId}`;
    link.download = "solar-load-calculator.xlsx";
    link.click();
  };

  const reset = () => {
    setFile(null);
    processBillMutation.reset();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
              <Zap size={18} fill="currentColor" />
            </div>
            <span className="font-bold text-xl tracking-tight">Solar Load Calculator</span>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span className="hidden sm:inline">Internal Tool</span>
            {healthStatus?.status === 'ok' && (
              <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                System Online
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl flex flex-col">
        {!processedData ? (
          <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
            <div className="text-center mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Automate Bill Analysis</h1>
              <p className="text-muted-foreground text-lg max-w-lg mx-auto">
                Upload a customer electricity bill to instantly extract data and generate a ready-to-use solar recommendation Excel.
              </p>
            </div>

            <Card className="w-full shadow-lg border-primary/10 relative overflow-hidden transition-all duration-300">
              {processBillMutation.isPending && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Analyzing Bill Data...</h3>
                  <p className="text-muted-foreground text-center max-w-xs">
                    Our AI is extracting consumption history, tariffs, and calculating optimal solar load.
                  </p>
                </div>
              )}

              <CardContent className="p-8 sm:p-12">
                <div 
                  className={`
                    border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors cursor-pointer
                    ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/5'}
                    ${file ? 'border-primary/50 bg-primary/5' : ''}
                  `}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileInput}
                  />
                  
                  {file ? (
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary mb-4">
                        {file.type.includes('pdf') ? <FileText size={32} /> : <FileImage size={32} />}
                      </div>
                      <p className="font-semibold text-lg mb-1">{file.name}</p>
                      <p className="text-sm text-muted-foreground mb-6">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      <Button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                        variant="outline" 
                        size="sm"
                      >
                        Change File
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
                        <Upload size={32} />
                      </div>
                      <p className="font-medium text-lg mb-2">Drag and drop a bill here</p>
                      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                        Supports PDF, JPG, or PNG formats up to 10MB. Make sure the text is clearly legible.
                      </p>
                      <Button variant="secondary" className="pointer-events-none">
                        Browse Files
                      </Button>
                    </>
                  )}
                </div>

                {processBillMutation.isError && (
                  <div className="mt-6 p-4 bg-destructive/10 text-destructive rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Failed to process bill</p>
                      <p className="text-sm opacity-90 mt-1">
                        {(processBillMutation.error as any)?.message || "An unexpected error occurred during processing."}
                      </p>
                    </div>
                  </div>
                )}

              </CardContent>
              <CardFooter className="bg-muted/50 p-6 flex justify-between items-center border-t">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> PDF
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileImage className="w-4 h-4" /> JPG/PNG
                  </div>
                </div>
                <Button 
                  onClick={handleProcess} 
                  disabled={!file || processBillMutation.isPending}
                  size="lg"
                  className="font-semibold"
                >
                  Extract & Calculate
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="text-primary" /> Analysis Complete
                </h2>
                <p className="text-muted-foreground">Data extracted successfully from {file?.name}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={reset}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Process Another
                </Button>
                <Button onClick={handleDownload} className="font-semibold" size="lg">
                  <Download className="w-4 h-4 mr-2" /> Download Excel
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/30 pb-4 border-b">
                  <CardTitle className="text-lg">Extracted Bill Data</CardTitle>
                  <CardDescription>Consumer and usage details</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    <div className="p-4 flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Consumer Name</span>
                      <span className="font-medium">{processedData.extractedData.consumerName}</span>
                    </div>
                    <div className="p-4 flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Consumer Number</span>
                      <span className="font-mono">{processedData.extractedData.consumerNumber}</span>
                    </div>
                    <div className="p-4 flex justify-between items-center bg-muted/10">
                      <span className="text-muted-foreground text-sm">Units Consumed</span>
                      <span className="font-semibold text-lg">{formatNumber(processedData.extractedData.unitsConsumed)} <span className="text-sm font-normal text-muted-foreground">kWh</span></span>
                    </div>
                    <div className="p-4 flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Sanctioned Load</span>
                      <span className="font-medium">{processedData.extractedData.sanctionedLoad} <span className="text-muted-foreground">kW</span></span>
                    </div>
                    <div className="p-4 flex justify-between items-center bg-muted/10">
                      <span className="text-muted-foreground text-sm">Total Bill Amount</span>
                      <span className="font-semibold text-lg text-foreground">{formatCurrency(processedData.extractedData.totalBillAmount)}</span>
                    </div>
                    <div className="p-4 flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Billing Month</span>
                      <span className="font-medium">{processedData.extractedData.billingMonth}</span>
                    </div>
                    <div className="p-4 flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Tariff Category</span>
                      <span className="font-medium">{processedData.extractedData.tariffCategory}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/20 shadow-md bg-gradient-to-br from-card to-primary/5">
                <CardHeader className="pb-4 border-b border-primary/10">
                  <CardTitle className="text-lg text-primary flex items-center gap-2">
                    <Zap className="w-5 h-5" /> Solar Recommendation
                  </CardTitle>
                  <CardDescription>Optimized system sizing and ROI</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="mb-8">
                    <p className="text-sm text-muted-foreground mb-1">Recommended System Size</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-foreground">{processedData.solarRecommendation.recommendedSystemSizeKw}</span>
                      <span className="text-xl text-muted-foreground font-medium">kW</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-card p-4 rounded-lg border shadow-sm">
                      <p className="text-xs text-muted-foreground mb-1">Monthly Savings</p>
                      <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(processedData.solarRecommendation.estimatedMonthlySavings)}
                      </p>
                    </div>
                    <div className="bg-card p-4 rounded-lg border shadow-sm">
                      <p className="text-xs text-muted-foreground mb-1">Annual Savings</p>
                      <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(processedData.solarRecommendation.estimatedAnnualSavings)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">Payback Period</span>
                        <span className="font-medium">{processedData.solarRecommendation.paybackPeriodYears} Years</span>
                      </div>
                      <Progress value={Math.max(0, 100 - (processedData.solarRecommendation.paybackPeriodYears * 10))} className="h-2 bg-muted" />
                    </div>
                    
                    <div className="pt-4 mt-4 border-t border-border/50 flex items-center gap-3 text-sm">
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground shrink-0">
                        🌿
                      </div>
                      <div>
                        <p className="font-medium">Environmental Impact</p>
                        <p className="text-muted-foreground">Reduces CO₂ by {formatNumber(processedData.solarRecommendation.co2ReductionKgPerYear)} kg per year</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="flex justify-center mt-8">
              <Button onClick={handleDownload} className="font-bold px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all hover:-translate-y-1" size="lg">
                <Download className="w-5 h-5 mr-2" /> Download Complete Report (Excel)
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 border-t mt-auto">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>Energybae Internal Tooling</p>
          <div className="flex items-center gap-2">
            <span>Powered by AI</span>
            <span className="w-1 h-1 rounded-full bg-border"></span>
            <a href="https://energybae.in" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors font-medium">
              energybae.in
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
