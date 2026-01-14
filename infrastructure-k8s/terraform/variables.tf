#--------------------------------------------------------------------
# Variables and locals
#

variable "key_pair_name" {
  description = "The name of the key pair to put on the server"
  type        = string
}

variable "identity_file" {
  description = "The path to the private key to use for authentication"
  type        = string
}

variable "external_network_name" {
  description = "The name of the external network to be used (public or campus)"
  type        = string
  default     = "public"
}

variable "subnet_cidr" {
  description = "The CIDR block for the subnet"
  type        = string
  default     = "192.168.40.0/24"
}

variable "flavor_name" {
  description = "The name of the flavor to be used"
  type        = string
  # IMPORTANT: this MUST match EXACTLY one of: openstack flavor list
  default     = "c2-r4-d40"
}

variable "image_name" {
  description = "The name of the image to be used"
  type        = string
  default     = "Ubuntu server 24.04.3 autoupgrade"
}

variable "base_name" {
  description = "Base prefix used for all resource names"
  type        = string
  default     = "smart-energy"
}

variable "server_name" {
  description = "The name of the k3s server to create"
  type        = string
  default     = "k3s-server"
}

variable "cp_count" {
  description = "Number of control-plane nodes"
  type        = number
  default     = 1
}

variable "worker_count" {
  description = "Number of worker nodes"
  type        = number
  default     = 2
}

locals {
  network_name  = "${var.base_name}-network"
  subnet_name   = "${var.base_name}-subnet"
  port_name     = "${var.base_name}-port"
  router_name   = "${var.base_name}-router"
  secgroup_name = "${var.base_name}-secgroup"
}
