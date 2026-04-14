export interface GenerateDiagnosisInput {
  name: string;
  age: string;
  animal: string;
  animalDescription: string;
  type: string;
  income: string;
  asset: string;
  experience: string;
  avoid: string;
}

export interface DiagnosisResult {
  strengthSection: string;
  animalSection: string;
  riskSection: string;
}

export const generateDiagnosis = async (
  userData: GenerateDiagnosisInput,
): Promise<DiagnosisResult | null> => {
  try {
    const response = await fetch("/api/matching/generate-diagnosis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      console.error("generateDiagnosis HTTP error:", response.status);
      return null;
    }
    const json = await response.json();
    if (
      typeof json.strengthSection !== "string" ||
      typeof json.animalSection !== "string" ||
      typeof json.riskSection !== "string"
    ) {
      console.error("generateDiagnosis unexpected shape:", json);
      return null;
    }
    return {
      strengthSection: json.strengthSection,
      animalSection: json.animalSection,
      riskSection: json.riskSection,
    };
  } catch (e) {
    console.error("generateDiagnosis error:", e);
    return null;
  }
};
