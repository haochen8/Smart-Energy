# Sample config for 2dv013-Smart-energy on Cumulus/OpenStack
os_project_name      = "2dv013-Smart-energy"
os_project_id        = "c06d07ab28a34c79a9c8dbf350165fcf" # Optional when clouds.yaml handles the project
os_cloud             = "" # Optional: set to your clouds.yaml entry
key_pair_name        = "smart-energy-keypair" # TODO: replace with the actual keypair name created in Horizon
identity_file        = "~/.ssh/smart-energy-keypair.pem"  # TODO: update to the matching private key path

# Network/external connectivity
external_network_name = "public" # TODO: switch to campus/public depending on what works in this project
subnet_cidr           = "192.168.40.0/24"

# Compute sizing
# Provide either flavor_name or flavor_id
flavor_name = "c2-r4-d20" # TODO: choose the biggest allowed flavor for the project
# flavor_id  = ""          # Optional: set if name lookup fails
image_name  = "Ubuntu server 24.04.3 autoupgrade"

# Naming and counts
base_name    = "smart-energy"
cp_count     = 1
worker_count = 2
ssh_user     = "ubuntu"
