{{- define "maude.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "maude.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "maude.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "maude.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
maude.io/cell: {{ .Values.cell.id | quote }}
maude.io/region: {{ .Values.cell.region | quote }}
{{- end -}}

{{- define "maude.selectorLabels" -}}
app.kubernetes.io/name: {{ include "maude.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "maude.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "maude.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "maude.priorityClassName" -}}
{{- if .Values.priorityClass.existingName -}}
{{- .Values.priorityClass.existingName -}}
{{- else if .Values.priorityClass.create -}}
{{- .Values.priorityClass.name -}}
{{- end -}}
{{- end -}}

{{- define "maude.image" -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
