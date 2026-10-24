terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.35"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.17"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state (example, not enabled). Create the storage account and container first.
  # backend "azurerm" {
  #   resource_group_name  = "tfstate"
  #   storage_account_name = "myorgtfstate"
  #   container_name       = "tfstate"
  #   key                  = "maude/azure.tfstate"
  # }
}
